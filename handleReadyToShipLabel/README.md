# Handle Ready to Ship Label

The `handleReadyToShipLabel` cloud function is responsible for removing the current assginees, assigning the Pull
Request owner, and finally removing the "Status: Review Complete" label.

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently
hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleReadyToShipLabel?project=team-196819&tab=source&duration=PT1H)
within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
