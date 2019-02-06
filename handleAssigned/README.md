# Handle Assigned

The `handleAssigned` cloud function is responsible for sending a Slack message
to team members as they are assigned to a Pull Request in GitHub.

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleAssigned?project=team-196819&tab=source&duration=PT1H) within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
