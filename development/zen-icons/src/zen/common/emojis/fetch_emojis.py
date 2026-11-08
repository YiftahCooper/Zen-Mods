# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import requests
import json


GROUP_CATEGORIES = {
    0: "Smileys & Emotion",
    1: "People",
    2: "Components",
    3: "Nature",
    4: "Food & Drink",
    5: "Travel & Places",
    6: "Activities",
    7: "Objects",
    8: "Symbols",
    9: "Flags",
}

ANIMAL_TERMS = {
    "animal", "bird", "bug", "butterfly", "cat", "chicken", "cow",
    "dog", "duck", "fish", "fox", "frog", "horse", "insect", "lion",
    "monkey", "mouse", "octopus", "owl", "panda", "penguin", "rabbit",
    "reptile", "shark", "sheep", "snail", "snake", "spider", "tiger",
    "turtle", "whale", "worm",
}

SPORT_TERMS = {
    "ball", "baseball", "basketball", "bowling", "boxing", "cricket",
    "football", "game", "golf", "hockey", "medal", "rugby", "soccer",
    "sport", "sports", "tennis", "trophy", "volleyball",
}


def get_category(emoji, tags):
  """Return a compact semantic picker category for an emojibase record."""
  group = emoji.get("group")
  normalized_tags = {str(tag).lower() for tag in tags}
  if group == 3 and normalized_tags.intersection(ANIMAL_TERMS):
    return "Animals"
  if group == 6 and normalized_tags.intersection(SPORT_TERMS):
    return "Sports"
  return GROUP_CATEGORIES.get(group, "Other")


def get_emojis(url):
  """
  Fetches emojis from the given URL and formats them into a JavaScript module.

  Args:
      url (str): The URL to fetch the emoji data from.

  Returns:
      array: A JavaScript array of emoji objects formatted for use in a module.
  """
  response = requests.get(url)
  response.raise_for_status()  # Raise an error for bad responses
  emojis_data = response.json()

  # Retain compact search/category data and discard presentation-only fields.
  emojis = []
  for emoji in emojis_data:
    tags = list(dict.fromkeys([
        *emoji.get("tags", []),
        *emoji.get("shortcodes", []),
        emoji.get("annotation", ""),
    ]))
    tags = [tag for tag in tags if tag]
    emojis.append({
        "tags": tags,
        "order": emoji.get("order", 0),
        "emoji": emoji.get("emoji", ""),
        "name": emoji.get("annotation", "") or emoji.get("emoji", ""),
        "category": get_category(emoji, tags),
    })
  return emojis


def get_js_code(emojis):
  """
  Generates JavaScript code to export the emojis as a module.

  Args:
      emojis (list): A list of emoji dictionaries.

  Returns:
      str: JavaScript code as a string.
  """
  js_code = """/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-unused-vars */
"""
  js_code += "var ZenEmojisData = "
  # dump without unicode escape
  js_code += json.dumps(emojis, ensure_ascii=False)
  return js_code


if __name__ == "__main__":
  # Define the URL for the emoji JSON file
  url = "https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1.8.0/en/emojibase/data.json"
  emojis_path = os.path.join(os.path.dirname(__file__), "ZenEmojisData.min.mjs")
  emojis = get_emojis(url)
  js_code = get_js_code(emojis)
  with open(emojis_path, "w", encoding="utf-8") as file:
    file.write(js_code)
  print(f"Emojis data has been written to {emojis_path}")
