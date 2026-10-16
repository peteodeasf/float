# A stacked pull request merged into the wrong branch, then a merge broke main

**2026-10-16.** Two things went wrong with the situation editor (#15). Each one cost a round trip.

## 1. #15 merged into #13's branch, not main

#15 was built on top of #13, so its base was `ladder-combinations-step5`. #11, #12 and #13 then merged
into main, but GitHub left #15's base where it was. GitHub only moves a pull request's base to main when
the old base branch is deleted, and these branches were kept. So approving and merging #15 put it into
`ladder-combinations-step5`. It took another pull request (#16) to get it to main.

**Next time:** once the pull requests underneath have merged, change the stacked one's base to main
before it is approved. To confirm something is really in main:

    git fetch origin main && git merge-base --is-ancestor <branch> origin/main && echo in main

## 2. The "Merge branch" step kept old code inside the new code

Before #15 merged, `ladder-combinations-step5` was merged into it in GitHub (0289b4a). #11–#13 had been
rewritten with new commit IDs, but their content was the same. Git still saw both sides changing the
same lines. The way the conflict was resolved kept pieces of the old editor in the middle of the new
one. `SessionPage.tsx` stopped parsing. CI did not catch it because no CI run covered the merge result
on main.

Netlify's build failed, so the live site stayed on the previous version. That is why "still the old
screen" was the only thing anyone saw. It looked like a slow deploy, not a broken build.

**How it was found:** the live JavaScript still had the old screen's text in it. Building `origin/main`
locally then failed straight away with JSX errors.

    curl -sL https://app.floatcbt.com | grep -oE '/assets/[^"]+\.js'   # then grep that file for new text
    cd apps/web && npx tsc -b --force

**Fix (#17):** put the three files back to #15's reviewed commit. The repository then matched that
commit exactly.

**Next time:** after anything merges to main, check that `origin/main` builds. If a screen doesn't
change after a deploy, look at the live JavaScript before assuming it's a cache.
