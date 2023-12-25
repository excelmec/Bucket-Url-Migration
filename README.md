## Excel Events Icon URL Migration

This script is used to update icons URLs in the existing events DB by uploading them to a new bucket and updating the DB with the new URL.

### UseCase
For a new Excel Year, the old prod data from database can be copied to the new DB as staging data for next year (with pg dump etc). 
However just copying the data won't copy the image to new Accounts' cloud storage. This will cause events db to error out if the event detail is updated in Alfred.

Note: If only new events are created in staging, then this is not an issue

### Usage
- Copy the Data from old table to new DB Table
- Create a GCP service account with access to Cloud Storage (Upload File permission is needed)
- create `.env` file in folder root with envs as shown in `.env.example`. The GCP credential file should be converted to base64
- Create a New Cloud Storage Bucket and add its name to env
- Install gcloud CLI (As of Dec 2023, cors couldn't be updated via GCP web console)
- Update the Bucket Cors to allow other sites by running. (Modify config if needed)

```
gcloud storage buckets update gs://<bucket_name> --cors-file=./cors.json
```

eg: If bucket name is `excel-mec-23`, this would be
```
gcloud storage buckets update gs://excel-mec-23 --cors-file=./cors.json
```
- Now Run this script
    - npm i
    - npm start
- If It went well, the DB should have been updated with new urls and icons should have been uploaded to new storage bucket.

If it didn't, well good luck debugging!
