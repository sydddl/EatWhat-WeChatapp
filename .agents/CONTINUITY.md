# Continuity

## Current State

- Mini Program MVP exists with pages for home, restaurant pool/form, draw, history, and docs.
- Cloud env is configured in app/project config. Existing deployed functions still must be manually uploaded in WeChat DevTools.
- UI direction: clean light main surfaces; only the draw page should use black ritual styling. EVA purple `#7F3AEF` and lime `#C6FF34` are reserved for the draw ritual page or very small accents. Avoid orange accents on white.
- Latest UI state: non-draw UI was restored to the EVA-corrected version from after the orange-to-purple fix: home uses hero-card/dot/member layout and restaurant pool uses light cards with purple enable orbs. Draw page remains separately dark ritual styled. Input sizing fix is preserved.
- New cloud function directory: `cloudfunctions/listDraws`, returning monthly draws, calendar heat data, and top restaurant counts.

## Next Checks

- In WeChat DevTools, deploy `listDraws` with cloud install dependencies before testing History.
- If the history page reports function not found, deploy `listDraws`; if it reports permission/query issues, inspect cloud database permissions and indexes for `draws.groupId` / `draws.createdAt`.
- User compiles/runs in WeChat DevTools; do not repeatedly request sandbox permissions unless needed.
- Member fix: joinGroup now counts members from the members collection and returns member profiles. Home page uses real member avatars via chooseAvatar -> cloud upload -> updateMemberProfile. Deploy joinGroup and updateMemberProfile after this change.

- Added group switching history and shared draw sessions: deploy listMyGroups and drawSessionAction. Draw page now uses session results/votes/finalize; only finalize writes to draws, so preview draws do not trigger recently-eaten penalties.
- Home stats are now navigable: the enabled-restaurant card opens restaurant management, and the group-member card opens pages/members/list. The members page reads profiles through joinGroup and lets users set avatar via chooseAvatar plus nickname input via updateMemberProfile; WeChat does not allow silent avatar/name reads.
- Latest batch: History calendar days expand to confirmed records and listDraws now formats/query-bounds in China time. Leave group moved from home hero to recent-groups actions and leaveGroup is more tolerant. Draw page ranks results by vote count, draw count, then latest draw; shows clearer vote state; watches drawSessions with polling fallback; finalize shows a modal after ending the round. Deploy listDraws, leaveGroup, and drawSessionAction after these changes.
