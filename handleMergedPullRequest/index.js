const crypto = require('crypto');
const got = require('got');
const url = require('url');
const Datastore = require('@google-cloud/datastore');
const slack = require('slack');

const settings = require('./settings.json');
const projectId = settings.projectId;

// Creates a client for Google Cloud Datastore
const datastore = new Datastore({
  projectId: projectId
});

// This function serves as a way to take the webhook data from GitHub
// determine if it was a merged PR and then store the data we need into
// Google Datastore
//
// Currently we store the following information in Datastore:
// Column
//  user // Represents github login name of PR creator
//  userId // Represents github user_id of PR creator
//  url // Represents link to Pull Request
//  number // Represents PR number. Example: #4852
//  title // Represents Title of Pull Request
//  body // Represents the text of the body of the PR. With markdown code included.
//  reviewers // Represents an object of the reviewers of the PR
//  mergedAt // timestamp of when the PR was merged from the merged_at json key
//  mergeCommitSha // sha of the commit
exports.handleMergedPullRequest = (req, res) => {
  console.log(`Receiving action: ${req.body.action}`);

  // Check if the PR is closed
  if (req.body.action != 'closed') {
    res.end();
    return;
  }

  const pullRequest = req.body.pull_request;

  // We want to only count merges for repos we're tracking
  if (!settings.repos.includes(pullRequest.head.repo.name)) {
    res.end();
    return;
  }

  // Check if the PR is merged
  if (!pullRequest.merged) {
    res.end();
    return;
  }

  // We only want to count merges into master
  if (pullRequest.base.ref !== 'master') {
    res.end();
    return;
  }

  // Validate the request
  validateRequest(req)
    .then(() => storeMergedPullRequest(pullRequest))
    .then(() => prepareRelease(pullRequest))
    .then(version => createRelease(pullRequest, version))
    .then(release => sendSlackMessages(pullRequest, release))
    .then(() => deleteBranch(pullRequest))
    .then(() => {
      console.log(
        `Saved Merged Pull Request by ${req.body.pull_request.user.login}`
      );
      res.status(200).end();
    })
    .catch(err => {
      console.error(err.stack);
      res
        .status(err.statusCode ? err.statusCode : 500)
        .send(err.message)
        .end();
    });
};

function validateRequest(req) {
  return Promise.resolve().then(() => {
    const digest = crypto
      .createHmac('sha1', settings.secretToken)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (req.headers['x-hub-signature'] !== `sha1=${digest}`) {
      const error = new Error('Unauthorized');
      error.statusCode = 403;
      throw error;
    } else {
      console.log('Request validated.');
    }
  });
}

function storeMergedPullRequest(pullRequest) {
  console.log('attempting to store PR');

  // Bail out if the pull request creator is not on the list of authors
  if (!settings.authors.includes(pullRequest.user.login)) {
    console.log('skipping the storage of the PR');
    return Promise.resolve();
  }

  // Kind for new entity
  const kind = 'GithubMerged';

  // Set the id to the pullRequest id
  const id = `${pullRequest.base.repo.name}-${pullRequest.number}`;

  // Cloud Datastore key for the new entity
  const key = datastore.key([kind, id]);

  // Prepare the new entity
  const mergedEntity = {
    user: pullRequest.user.login,
    userId: pullRequest.user.id,
    repo: pullRequest.base.repo.name,
    number: pullRequest.number,
    title: pullRequest.title,
    branch: pullRequest.head.ref,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    changedFiles: pullRequest.changed_files,
    mergedAt: pullRequest.merged_at,
    mergeCommitSha: pullRequest.merge_commit_sha,
    url: pullRequest.html_url
  };

  const entity = {
    key: key,
    data: mergedEntity
  };

  // Save the entity into Google Datastore
  return datastore.insert(entity);
}

function makeRequest(uri, options) {
  options || (options = {});

  // Add appropriate headers
  options.headers || (options.headers = {});
  options.headers.Accept =
    'application/vnd.github.black-cat-preview+json,application/vnd.github.v3+json';

  // Send and accept JSON
  options.json = true;
  if (options.body) {
    options.headers['Content-Type'] = 'application/json';
  }

  options.throwHttpErrors = false;

  // Add authentication
  const parts = url.parse(uri);
  parts.auth = `proctoru-bot:${settings.accessToken}`;

  // Make the request
  return got(parts, options);
}

function deleteBranch(pullRequest) {
  const branch = pullRequest.head.ref;
  const url = `${pullRequest.head.repo.url}/git/refs/heads/${branch}`;

  return makeRequest(url, {
    method: 'DELETE'
  });
}

function prepareRelease(pullRequest) {
  const semverType = getSemverType(pullRequest);

  return getLatestRelease(pullRequest).then(release =>
    getNextVersion(release, semverType)
  );
}

// 0 = major
// 1 = minor
// 2 = patch
function getSemverType(pullRequest) {
  const labels = pullRequest.labels.filter(
    label => label.name.includes('Dependency:') || label.name.includes('Type:')
  );

  if (labels.length < 1) {
    return 1;
  } else {
    const hasDependencies = labels.some(label =>
      label.name.includes('Dependency:')
    );

    if (hasDependencies) {
      return 2;
    } else {
      const isFeature = labels.some(label =>
        label.name.includes('Type: Feature')
      );

      if (isFeature) {
        return 1;
      } else {
        return 2;
      }
    }
  }
}

function getLatestRelease(pullRequest) {
  return makeRequest(`${pullRequest.base.repo.url}/releases/latest`).then(
    response => {
      const status = response.statusCode;

      if (status < 500) {
        if (status === 404) {
          return '0.0.0';
        } else {
          return response.body.tag_name;
        }
      } else {
        throw new Error(response);
      }
    }
  );
}

// @param semverType Integer - 0, 1, 2
function getNextVersion(currentVersion, semverType) {
  console.log('Current version: ', currentVersion);

  const numbers = currentVersion.split('.');
  numbers[semverType] = parseInt(numbers[semverType]) + 1;

  switch (semverType) {
    case 0:
      numbers[1] = 0;
      numbers[2] = 0;
      break;
    case 1:
      numbers[2] = 0;
      break;
  }

  const nextVersion = numbers.join('.');
  console.log('Next version: ', nextVersion);

  return Promise.resolve(nextVersion);
}

function createRelease(pullRequest, tagName) {
  return makeRequest(`${pullRequest.base.repo.url}/releases`, {
    method: 'POST',
    body: {
      tag_name: tagName,
      name: `Version ${tagName}`,
      body: getReleaseBody(pullRequest)
    }
  });
}

function getReleaseBody(pullRequest) {
  return `
### Change

**Title**: ${pullRequest.title}
**Link**: #${pullRequest.number}

### Contributor

@${pullRequest.user.login}
  `;
}

function sendSlackMessages(pullRequest, release) {
  console.log('Posting release to Slack');

  return slack.chat.postMessage({
    token: settings.slackToken,
    channel: '#engineering',
    text: getSlackText(pullRequest, release),
    username: 'storm',
    icon_url: 'https://s3-us-west-2.amazonaws.com/storm-app/icon.png?v=2'
  });
}

function getSlackText(pullRequest, release) {
  const releaseBody = release.body;

  return `
New release for ${pullRequest.base.repo.name}: ${releaseBody.tag_name}!
\n
${releaseBody.html_url}
  `;
}
