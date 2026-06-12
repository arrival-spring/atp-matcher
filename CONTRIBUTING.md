# Contributing to ATP Matcher

Thank you for your interest in contributing! This project matches data from [All The Places](https://alltheplaces.xyz) to OpenStreetMap to help keep OSM data up to date.

## Finding a Spider

First, head over to [All The Places](https://alltheplaces.xyz) to find a suitable spider.

**Important:** We only accept data from **first-party websites** (e.g., the official store locator of a brand). We do not accept data from third-party aggregators, directories, or social media pages.

## How to Contribute a New Spider

You don't need any special technical skills or software to contribute. You can edit the configuration files directly here on the GitHub website in your browser.

**Note:** Please do not open an issue to request a new spider. Instead, just add it directly by following the steps below.

### 1. Add to Preview

All new spiders must first be added to `spiders_preview.json`. This allows us to preview the data before enabling any automated updates.

Find `spiders_preview.json` in the file list, click on it, and then click the pencil icon to edit. Add your spider at the end of the file.

**Don't worry about formatting:** You don't need to worry about precise indentation or alphabetical order. Our automated scripts will handle all the formatting and sorting for you when you submit your contribution.

#### Configuration Structure

Each spider entry looks like this:

```json
"spider_name": {
    "source_uri": ["brandwebsite.com"],
    "importableTags": ["phone", "email"],
    "categories": [{"amenity": "restaurant"}],
    "showUnmatched": true
}
```

*   `source_uri` (**Required**): A list of domains that the spider is allowed to use. This must be the official domain(s) of the brand.
*   `importableTags` (Optional): A list of additional tags to import (e.g., `phone`, `email`). Note that `opening_hours` and `website` are always included automatically if they are available in the data.
*   `categories` (Optional): Use this if you need to filter the spider's data to specific OSM features (e.g., `[{"amenity": "fuel"}]`).
*   `showUnmatched` (Optional): Set this to `true` to show items that haven't been matched to OSM yet on the dashboard.

### 2. Submit a Pull Request

Once you have added your spider, save your changes and choose the option to "Create a new branch for this commit and start a pull request."

## Moving a Spider to "Auto"

After a spider has been in the "Preview" stage and you have confirmed that the data is accurate and matching correctly, it can be moved to `spiders_auto.json`. This enables automated update suggestions.

To move a spider to auto:
1. Create a pull request moving the spider's configuration from `spiders_preview.json` to `spiders_auto.json`.
2. **Provide evidence of verification:** In your pull request description, you **must** state what you have done to verify the accuracy of the spider. For example, mention that you checked several locations against the official website or verified that the coordinates and tags match the real-world locations.

**Review Process:** When a spider is proposed for "Auto", we post a notification on the OpenStreetMap community forums. There is a mandatory two-week waiting period to allow the community to review the data before the spider is merged and automated updates begin.

## Other Contributions

If you want to suggest bigger changes, new features, or fix bugs in the code, please open an issue first so we can discuss the proposal before you start working on it.
