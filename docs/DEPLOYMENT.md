# Deployment and rollback

## Blocked external operations

The available GitHub API returned Forbidden for both user lookup and `gh repo create`. A follow-up HTTPS check showed the network proxy rejects the CONNECT tunnel to `api.github.com` with 403, so API authorization has not yet been tested. A `GH_TOKEN` binding is present (value was not inspected). The existing application and the two likely scanner repository URLs returned Repository not found via read-only Git. These responses do not prove the repositories are absent. No remote repository, PR, Pages site, repository settings or production deployment has been created or changed.

Smallest unblock: review/save the environment draft adding `api.github.com` to the custom network allowlist, then publish the environment as required by the platform. The package-manager presets were preserved. Saving the draft alone does not activate network access. Retry API identity/repository checks using existing authentication after activation; request additional permissions only if those operations then fail. Also grant repository visibility to the authoritative source if it remains inaccessible. Alternatively, an owner can create `annual-day-2026-scanner`, upload/push these files and configure Pages themselves. Keep the source private while reviewing; public visibility requires confirming that publication is intended. Private-repository Pages availability depends on the GitHub plan, and a Pages site may be publicly accessible even with private source. Do not purchase a plan automatically.

## Camera-only publication steps

1. Review the source; confirm no real badge tokens, PINs or attendee records are included. Choose the repository owner explicitly. If a scanner repository already exists, inspect it and use a feature branch; never overwrite it or force-push.
2. For a verified empty destination, set the correct HTTPS origin, commit the code and push main. For an existing destination, open a PR and merge approved changes. Configure main branch protection with required validation and review. No remote owner is preconfigured locally because authenticated ownership is unknown.
3. In repository Settings → Pages choose **GitHub Actions** as the build/deployment source. Configure `github-pages` environment protection for main and required reviewers where supported. Grant Actions only the permissions in the workflow. No deployment secrets are needed for the camera test.
4. Run or allow the `Validate and deploy camera test` workflow. Confirm every validation job and the deployment job succeed. Use the deployment job's returned `page_url`; do not guess a live URL.
5. Request the returned HTTPS URL, verify the camera-only heading and JS/CSS/worker assets at the project path, and check browser console/CSP errors. Complete the physical-phone checklist in VOLUNTEER-GUIDE.md. Record deployed commit and results. Do not enable attendance as part of this deployment.

## Rollback

Revert the problematic frontend merge through a reviewed PR and rerun the Pages workflow to redeploy the last tested version. Verify the resulting HTTPS page on both phones. To withdraw an unsafe camera test, an owner may unpublish Pages through Settings; this requires explicit approval if treated as an irreversible operation. No production Apps Script rollback is needed for this camera-only build because it makes no backend changes.

Later attendance releases require separately approved Apps Script/Worker deployment instructions, version identifiers, staging evidence and a coordinated frontend/backend rollback that preserves all recorded attendance. Those instructions cannot be finalized without the actual source and chosen hosting account.
