# Handle Merged Pull Request

The `handleMergedPullRequest` cloud function is responsible for a few things, including: storing the Pull
Request in Datastore, creating a new Release on GitHub, sending a Slack message regarding the Release,
and finally deleting the branch from GitHub.

The Slack message will looking something like this:

```
proctoru [4:13 PM]
New release for cloud-functions: 0.9.0!


https://github.com/ProctorU/cloud-functions/releases/tag/0.9.0
```

## Deployment

1. First, download the `settings.json` file to your local repository. It's currently hosted [within the GCP console](https://console.cloud.google.com/functions/details/us-central1/handleMergedPullRequest?project=team-196819&tab=source&duration=PT1H) within the Cloud Functions section.

2. Make your changes.

3. Deploy the changes.

   ```bash
   yarn deploy
   ```
