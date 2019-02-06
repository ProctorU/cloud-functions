# Handle Review Complete Label

The `handleReviewCompleteLabel` cloud function is responsible for removing labels, removing the current assignees,
and assigning the Pull Request owner.

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleReviewCompleteLabel?project=team-196819&tab=source&duration=PT1H) within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
