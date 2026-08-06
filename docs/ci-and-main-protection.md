# Continuous integration and `main` protection

The `CI` workflow runs for pushes and pull requests targeting `develop` or
`main`. It also supports GitHub merge queues. The workflow provides three stable
checks:

- `CI / Backend`
- `CI / Frontend`
- `CI / Infrastructure`

The application checks install from lockfiles, reject critical dependency
findings, run the complete automated test suites, build the production frontend,
and validate every CloudFormation template in `infra`.

## Enable protection after the workflow is merged

GitHub cannot require a status check until that check has completed in the
repository at least once. After the first `CI` run on the pull request succeeds,
configure a branch ruleset for `main` with:

1. Require a pull request before merging.
2. Require one approval and dismiss stale approvals after new commits.
3. Require conversation resolution.
4. Require the branch to be current before merging.
5. Require `CI / Backend`, `CI / Frontend`, and `CI / Infrastructure`.
6. Block force pushes and branch deletion.
7. Apply the requirements to repository administrators.

Keep automatic Production deployment coordinated with the release runbook. A
successful CI run means the revision is eligible for release; it does not by
itself authorize a Production deployment.

The reviewed settings are stored in .github/main-branch-protection.json.
After the first successful CI run, a repository administrator can apply them
with:

    .\scripts\configure-main-branch-protection.ps1 -Repository owner/repository

This command changes the GitHub repository setting. Review the JSON and the
first workflow run before executing it.
