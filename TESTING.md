# Testing Guide

## Manual Test In WeChat DevTools

1. Open the home page for the first time. It should call `createGroup`, and the restaurant count should be `0`.
2. Open restaurant management, then add a restaurant.
3. Paste Dianping-style shared text and click parse. Confirm name, address, and sourceUrl are filled.
4. Fill price range, tags, weight, and save. The list should show the new restaurant.
5. Return home. The restaurant count should increase.
6. Open draw page and draw without filters. It should return one restaurant and write a `draws` record.
7. Try tag, priceRange, and locationText filters. Empty candidate results should show a no-match toast.
8. Disable a restaurant in the list. It should not appear in later draw candidates.
9. Share or simulate a path with `groupId`. The opened page should enter the same group.
10. Open history. It should show recent draw results.

## Cloud Function Test Events

`createGroup`:

```json
{ "name": "Today Eat What" }
```

`addRestaurant`:

```json
{
  "groupId": "replace-with-real-groupId",
  "name": "Sample Hotpot",
  "address": "100 Wensan Road",
  "priceRange": "80-120",
  "tags": ["hotpot", "team"],
  "baseWeight": 2,
  "sourceUrl": "https://www.dianping.com/shop/example",
  "note": "Good for groups"
}
```

`listRestaurants`:

```json
{ "groupId": "replace-with-real-groupId", "includeDisabled": true }
```

`drawRestaurant`:

```json
{
  "groupId": "replace-with-real-groupId",
  "filters": { "tag": "hotpot", "priceRange": "80-120", "locationText": "Wensan" }
}
```