# Continuity

## Current State

- Mini Program MVP exists with pages for home, restaurant pool/form, draw, history, and docs.
- Cloud env is configured in app/project config. Existing deployed functions still must be manually uploaded in WeChat DevTools.
- UI direction: clean light main surfaces; only the draw page should use black ritual styling. EVA purple `#7F3AEF` and lime `#C6FF34` are reserved for the draw ritual page or very small accents. Avoid orange accents on white.
- Latest UI state: non-draw UI was restored to the EVA-corrected version from after the orange-to-purple fix: home uses hero-card/dot/member layout and restaurant pool uses light cards with purple enable orbs. Draw page remains separately dark ritual styled. Input sizing fix is preserved.
- New cloud function directory: `cloudfunctions/listDraws`, returning monthly draws, calendar heat data, and top restaurant counts.
- Group-level location is implemented: the home `成员设置` action is now `群组设置`, and `pages/members/list` contains the default-origin entry instead of showing it in the home action stack. `pages/settings/group_location` selects a shared `groups.defaultOrigin` through `wx.chooseLocation`, backed by the new `groupLocation` cloud function with creator plus `openid`/`_openid` membership compatibility. Restaurant forms can save `restaurants.location`; the pool shows straight-line distance from the group origin and opens the restaurant in WeChat Maps.
- Restaurant pool export is now v2 with `sourceGroup.defaultOrigin` and optional restaurant locations; import remains compatible with v1 and preserves restaurant locations without overwriting the target group's origin.
- Restaurant pool now has compact `全部启用` / `全部停用` commands. They use the `addRestaurant` cloud function action `setAllDisabled` for one collection update, then automatically fall back to batched per-restaurant updates when the deployed function is still an older version or the collection update does not apply.
- Nearby restaurant batch entry is implemented at `pages/restaurants/nearby`: it centers the native map on the group default origin, supports native POI taps, searches Tencent Location Service WebService results by keyword/radius, preserves multi-selection across searches, and imports selected places with empty custom tags through `importRestaurantPool`. The server-side `searchNearbyRestaurants` function reads `TENCENT_MAP_KEY` from its environment and never exposes the key to the Mini Program client; identical queries are cached for five minutes in a warm function instance. The page states that personal-developer Tencent Location Service quota is limited, and quota errors 120/121 are shown as concise user-facing messages.

## Next Checks

- In WeChat DevTools, deploy `listDraws` with cloud install dependencies before testing History.
- Deploy `groupLocation`, `addRestaurant`, `exportRestaurantPool`, `importRestaurantPool`, and `drawSessionAction` before testing location, bulk enable/disable, transfer v2, and location snapshots.
- Create and enable a Tencent Location Service WebService key, set it as the `TENCENT_MAP_KEY` environment variable for `searchNearbyRestaurants`, then deploy that function with cloud dependencies. Redeploy `groupLocation` and `importRestaurantPool` if their current local location-aware versions have not been uploaded yet.
- In the Mini Program privacy settings, declare the location purpose used by `chooseLocation`; then compile once in WeChat DevTools and test both first-time permission grant and denied-permission recovery.
- If the history page reports function not found, deploy `listDraws`; if it reports permission/query issues, inspect cloud database permissions and indexes for `draws.groupId` / `draws.createdAt`.
- User compiles/runs in WeChat DevTools; do not repeatedly request sandbox permissions unless needed.
- Member avatar fix: avatar uploads still store stable `cloud://` fileIDs, but `joinGroup` now resolves them to HTTPS temporary URLs in the cloud function so private files render across different users on real devices. `drawSessionAction` does the same for voter avatars. `joinGroup` and `updateMemberProfile` accept both `openid` and legacy `_openid`; returned member lists are deduplicated by user identity. Deploy `joinGroup`, `updateMemberProfile`, and `drawSessionAction` after this change.

- Added group switching history and shared draw sessions: deploy listMyGroups and drawSessionAction. Draw page now uses session results/votes/finalize; only finalize writes to draws, so preview draws do not trigger recently-eaten penalties.
- Home stats are now navigable: the enabled-restaurant card opens restaurant management, and the group-member card opens pages/members/list. The members page reads profiles through joinGroup and lets users set avatar via chooseAvatar plus nickname input via updateMemberProfile; WeChat does not allow silent avatar/name reads.
- Latest batch: History calendar days expand to confirmed records and listDraws now formats/query-bounds in China time. Leave group moved from home hero to recent-groups actions and leaveGroup is more tolerant. Draw page ranks results by vote count, draw count, then latest draw; shows clearer vote state; watches drawSessions with polling fallback; finalize shows a modal after ending the round. Deploy listDraws, leaveGroup, and drawSessionAction after these changes.
