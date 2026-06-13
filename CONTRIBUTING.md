# Contributing to ATP Sync

Thank you for your interest in contributing! This project matches data from [All The Places](https://alltheplaces.xyz) (ATP) to OpenStreetMap to help keep OSM data up to date.

## Finding a Spider

First, go to [All The Places](https://alltheplaces.xyz) to find a suitable spider. It will need to have a suitable way to match it to OSM objects, usually the store specific website, but if that is not available then a store code in `ref` could be used. Generally, we are only interested in spiders that have `opening_hours` included, sometimes a contribution can be made to ATP to include them in results if they are not currently being scraped.

**Important:** We only accept data from **first-party websites** (e.g., the official store locator of a brand). We do not accept data from third-party aggregators, directories or where the brand data is stored on a third-party website.

## How to Contribute a New Spider

You don't need any special technical skills or software to contribute. You can edit the configuration files directly here on the GitHub website in your browser.

**Note:** Please do not open an issue to request a new spider. Instead, just add it directly by following the steps below.

### 1. Add to Preview

All new spiders must first be added to [spiders_preview.json](/spiders_preview.json). This allows the data to be previewed before any automated updates are enabled.

Go to [spiders_preview.json](/spiders_preview.json) and then click the pencil icon to edit. Add your spider anywhere in the file.

**Don't worry about formatting or sorting:** You don't need to worry about precise indentation or alphabetical order. An automated script will handle all the formatting and sorting for you when you submit your contribution.

#### Configuration Structure

Each spider entry looks like this:

```json
"spider_name": {
    "source_uri": ["brandwebsite.com"],
    "importableTags": ["phone", "email"],
    "categories": [{"amenity": "bank"}],
    "showUnmatched": true
}
```

- `source_uri` (**Required**): A list of domains that the spider is allowed to use. This must be the official domain(s) of the brand.
- `importableTags` (Optional): A list of additional tags to import (e.g., `phone`, `email`). Note that `opening_hours` and `website` are always included automatically if they are available in the data.
- `categories` (Optional): Use this if you need to filter the spider's data to specific OSM features (e.g., `[{"amenity": "bank"}]` for a spider that also includes ATMs).
- `showUnmatched` (Optional): Set this to `true` to show items that haven't been matched to OSM yet on the dashboard. Leave this out for global brands that have spiders for each country as the dashboard cannot filter OSM data by country.

#### Other Optional Properties

- `rejected` (Optional): If you find that a spider is not suitable for automatic updates, you can add this property with a reason. This will be displayed on the website to inform others. The reason is free text and should be written in the local language of the spider or in English. Note that spiders with a `rejected` property cannot be moved to the "Auto" tier.
- `ref_key` (Optional): By default, the `wrbsite` or `ref` tag is used for matching ATP items to OSM objects. If the spider uses a different property for its unique identifier, you can specify it here (e.g., `"ref_key": "branch"` or `"ref_key": "ref:*"`).

### 2. Submit a Pull Request

Once you have added your spider, save your changes and choose the option to "Create a new branch for this commit and start a pull request."

Your contribution will be reviewed and once it has been merged you will be able to see the results in the next weekly run.

## Moving a Spider to "Auto"

After a spider has been in the "Preview" stage and you have confirmed that the data is accurate and matching correctly, it can be moved to [spiders_auto.json](/spiders_auto.json). This enables automated updates by a bot when changes are detected. Edits with the status of "Add to OSM" and "Update OSM" will be made in the OSM database.

To move a spider to auto:

1. Create a pull request moving the spider's configuration from [spiders_preview.json](/spiders_preview.json) to [spiders_auto.json](/spiders_auto.json) (or just copy the configuration to the auto file and a script on the pull request will remove it from preview automatically).
2. **Provide evidence of verification:** In your pull request description, you **must** state what you have done to verify the accuracy of the spider. For example, mention that you surveyed several locations to verify the opening hours and that the matching between ATP items and OSM objects appears to be accurate.

**Review Process:** When a spider is proposed for "Auto", a comment will need to be posted on the OpenStreetMap community forum thread. This is usually done once per week for any spiders being proposed for automatic updates. There is a mandatory two-week waiting period to allow the community to review the data before the spider is merged and automated updates begin.

## Translations

We welcome translations for the dashboard! All translation files are located in the [src/locales/](/src/locales/) directory.

- **Master Locale:** [en.json](/src/locales/en.json) is the master locale file. All other main locales (e.g., `fr.json`, `de.json`) must include all the keys present in `en.json`.
- **Sub-locales:** If you are adding a sub-locale (e.g., `en-GB.json`, `fr-CA.json`), you only need to include the keys that differ from the main locale. For example, [en-GB.json](/src/locales/en-GB.json) only contains a few overrides for British English.

## Other Contributions

If you want to suggest bigger changes or new features, please open an issue first to discuss the proposal before you start working on it.
