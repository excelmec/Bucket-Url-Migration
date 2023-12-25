import pg from 'pg';
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import axios from 'axios';
import imageType from 'image-type';
import { MultiBar, Presets } from 'cli-progress';

dotenv.config();

const DB_URI = process.env.DB_URI;
if (!DB_URI) {
	throw new Error('No DB_URI env variable');
}

const gcpCredBase64 = process.env.GOOGLE_CLOUD_KEY_BASE64;
if (!gcpCredBase64) {
	throw new Error('No GOOGLE_CLOUD_KEY_BASE64 env variable');
}
const bucketName = process.env.BUCKET_NAME;
if (!bucketName) {
	throw new Error('No BUCKET_NAME env variable');
}

const postgresConfig = {
	connectionString: DB_URI,
};
const client = new pg.Client(postgresConfig);

const credentials = JSON.parse(Buffer.from(gcpCredBase64, 'base64').toString());
const storage = new Storage({
	credentials: credentials,
});
const bucket = storage.bucket(bucketName);

const pathPrefix = 'events/icons';

async function migrateImages() {
	await client.connect();
	console.log('Connected to PostgreSQL');

	let completed = 0;
	let ignored = 0;
	const ignoredRowIds = [];
	const multibar = new MultiBar(
		{
			stopOnComplete: true,
			clearOnComplete: true,
		},
		Presets.shades_classic
	);

	try {
		client.query('SET search_path TO "events_db"');
		const result = await client.query('SELECT "Id", "Icon" FROM "Events"');
		const rows: {
			Id: number;
			Icon: string;
		}[] = result.rows;
		multibar.log(`Found ${rows.length} rows`);

		const totalProgressBar = multibar.create(rows.length, 0);
		const total = rows.length;

		totalProgressBar.start(total, 0);

		for (const row of rows) {
			try {
				const { Id, Icon } = row;
				if (!Icon) {
					ignored++;
					multibar.log(`Ignoring row ${Id} with no icon\n`);
					ignoredRowIds.push(Id);
					continue;
				}

				const imageRes = await axios.get(Icon, {
					responseType: 'arraybuffer',
				});

				const imageBuffer = imageRes.data;

				const imgType = await imageType(imageBuffer);

				if (!imgType) {
					ignored++;
					multibar.log(`Ignoring row ${Id} with no image type\n`);
					ignoredRowIds.push(Id);
					continue;
				}

				const { ext } = imgType;
				const supportedExts = ['jpg', 'png'];

				if (!supportedExts.includes(ext)) {
					ignored++;
					multibar.log(
						`Ignoring row ${Id} with unsupported extension ${ext} and type ${imgType.mime}\n`
					);
					ignoredRowIds.push(Id);
					continue;
				}

				const destFileName = `${pathPrefix}/${Id}.${ext}`;
				const newUrl = `https://storage.googleapis.com/${bucketName}/${destFileName}`;

				if (Icon === newUrl) {
					ignored++;
					multibar.log(`Ignoring row ${Id} with same url\n`);
					ignoredRowIds.push(Id);
					continue;
				}

				await bucket.file(destFileName).save(imageBuffer);
				completed++;
				totalProgressBar.update(completed + ignored);

				await client.query(
					'UPDATE "Events" SET "Icon" = $1 WHERE "Id" = $2',
					[newUrl, Id]
				);
			} catch (error) {
				console.log(`Error during row ${row.Id}: ${error.message} \n`, {
					error,
				});
			}

		}

		multibar.log('Migration complete\n');
	} catch (error) {
		console.error('\nError during migration:', error, '\n');
	} finally {
		client.end();
		multibar.log(
			`Ignored ${ignored} rows: with Ids: [${ignoredRowIds.join(', ')}]\n`
		);
	}
}

migrateImages();
