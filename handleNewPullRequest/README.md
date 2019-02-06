# Handle New Pull Request

The `handleNewPullRequest` cloud function is responsible for assigning two engineers as the reviewers to a Pull Request,
making sure the Gemfile_next.lock is accurate, letting the Business Intelligence team know if there are any DB changes,
any finally ensuring there is a proper "Type" label on the Pull Request.

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently
hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleNewPullRequest?project=team-196819&tab=source&duration=PT1H)
within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
