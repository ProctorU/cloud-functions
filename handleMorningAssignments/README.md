# Handle Morning Assignments

The `handleMorningAssignments` cloud function is responsible for sending a Slack message
to each engineer on the team with a link to each Pull Request they currently need to review.

## Deployment

1.  First, download the `settings.json` file to your local repository. It's currently hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleMorningAssignments?project=team-196819&tab=source&duration=PT1H) within the Cloud Functions section.

2.  Make your changes.

3.  Deploy the changes.

    ```bash
    yarn deploy
    ```

## Scheduler Jobs

Every day at 8am CST, we have a [GCP Scheduler Job](https://cloud.google.com/scheduler/) that sends a request to the Cloud
Function. The job's name is `handleMorningAssignmentsJob`. To view jobs under the Team project, use the following command.

```bash
➜ gcloud beta scheduler jobs list

ID                           LOCATION     SCHEDULE (TZ)            TARGET_TYPE  STATE
handleMorningAssignmentsJob  us-central1  0 8 * * * (US/Central)  HTTP         ENABLED
```

To update this job, you'll need to first delete the job and then re-create it (as of this writing). You can use the following commands to perform this.

```bash
# delete current job
➜ gcloud beta scheduler jobs delete handleMorningAssignmentsJob


# create new job, set to 3pm CST
➜ gcloud beta scheduler jobs create http handleMorningAssignmentsJob --uri=https://us-central1-team-196819.cloudfunctions.net/handleMorningAssignmens --description="Send a morning reminder to review Pull Requests" --time-zone="US/Central" --schedule="0 8 * * *"
```
