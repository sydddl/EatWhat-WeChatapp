# EatWhat WeChat Mini Program MVP

A runnable WeChat Mini Program MVP for deciding what to eat in a fixed WeChat group. It uses native Mini Program pages with TypeScript, WeChat Cloud Database, and cloud functions.

## Current Features

- Group lifecycle: create, join, switch, share by `groupId`, leave a group, and auto-dissolve a group when the last member leaves.
- Member profile: group member list, nickname, avatar, and vote display.
- Restaurant pool: view, add, edit, enable, disable, and assign multiple tags to each restaurant.
- Dianping paste parser: local heuristic parsing for restaurant name, address/location text, and sourceUrl. No Dianping API is used.
- Preference tokens: each user has 2 plus tokens and 2 minus tokens per group. A user can place at most one token on a restaurant. Token counts are visible to group members and affect draw probability.
- Draw sessions: filter by tag, priceRange, and locationText; draw multiple candidates in one round; vote or abstain; finalize one result into history.
- Probability controls: group-level plus-token delta, minus-token delta, recent-eaten penalty, recent-eaten window, and softmax temperature.
- Probability explanation: draw results show the final probability and triggered factors such as baseWeight, tokens, and recent-eaten penalty.
- History: monthly calendar, restaurant frequency ranking, and draw snapshots.
- Restaurant pool transfer: export and import restaurant pool configuration for sharing or migration between groups.
- Draw sound: plays a local draw audio clip when drawing.

## Probability Model

Candidates are filtered first. For each candidate:

```text
score_i = ln(baseWeight_i) + sum(delta_i)
P_i = exp(score_i / T) / sum(exp(score_j / T))
```

Default deltas:

- Plus preference token: `+0.5`
- Minus preference token: `-0.5`
- Recently eaten penalty: `-2`
- Softmax temperature: `1`

The probability settings page previews how one single change affects actual probability for 2, 5, 10, 20, and 50 candidates.

## Cloud Database Collections

Create these collections in WeChat Cloud Development:

- `groups`
- `members`
- `restaurants`
- `draws`
- `preferenceTokens`
- `drawSessions`

## Cloud Functions

Implemented functions:

- `createGroup`
- `joinGroup`
- `leaveGroup`
- `updateMemberProfile`
- `addRestaurant`
- `listRestaurants`
- `drawRestaurant`
- `drawSessionAction`
- `listDraws`
- `listMyGroups`
- `setPreferenceToken`
- `getProbabilityConfig`
- `updateProbabilityConfig`
- `exportRestaurantPool`
- `importRestaurantPool`

Each cloud function has its own `package.json`. In WeChat DevTools, install dependencies and upload each changed function directory.

## Share Path

The shared path carries the group id:

```text
/pages/index/index?groupId=<groupId>
```

Opening the shared path from a WeChat group calls `joinGroup` and enters the same group.

## Local Setup

1. Open this directory in WeChat DevTools.
2. Enable Cloud Development and confirm `cloudfunctionRoot` is `cloudfunctions/`.
3. Create the database collections listed above.
4. Install dependencies and upload each `cloudfunctions/*` function.
5. Compile and run the mini program.

Optional TypeScript check:

```bash
npm install
npm run typecheck
```