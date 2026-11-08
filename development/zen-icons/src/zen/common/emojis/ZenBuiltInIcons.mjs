/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createIconRecord } from "./ZenIconRegistry.mjs";

const SOURCE_ROOT = "chrome://browser/skin/zen-icons/selectable/";

function titleFromFilename(filename) {
  return filename
    .replace(/\.svg$/, "")
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function icon(
  filename,
  category,
  {
    name = titleFromFilename(filename),
    aliases = [],
    tags = [],
    lucideEquivalentIds = [],
    lucideAllowedIds = [],
    allowConceptVariant = false,
  } = {},
) {
  const id = filename.replace(/\.svg$/, "");
  return createIconRecord({
    id,
    provider: "zen",
    name,
    aliases,
    tags: [category, ...id.split("-"), ...tags],
    categories: [category],
    source: `${SOURCE_ROOT}${filename}`,
    kind: "svg",
    lucideEquivalentIds,
    lucideAllowedIds,
    allowConceptVariant,
  });
}

export const ZEN_BUILT_IN_ICONS = Object.freeze([
  icon("airplane.svg", "Travel", {
    aliases: ["plane", "flight"],
    tags: ["airport", "flying"],
    lucideEquivalentIds: ["plane"],
  }),
  icon("american-football.svg", "Sports", {
    aliases: ["gridiron"],
    tags: ["nfl", "ball", "game"],
  }),
  icon("baseball.svg", "Sports", {
    tags: ["ball", "mlb", "game"],
  }),
  icon("basket.svg", "Shopping", {
    tags: ["groceries", "store", "cart"],
    lucideEquivalentIds: ["shopping-basket"],
  }),
  icon("bed.svg", "Home", {
    tags: ["sleep", "hotel", "bedroom"],
    lucideEquivalentIds: ["bed"],
  }),
  icon("bell.svg", "Communication", {
    tags: ["notification", "alert", "reminder"],
    lucideEquivalentIds: ["bell"],
  }),
  icon("bookmark.svg", "Reading", {
    tags: ["save", "favorite", "later"],
    lucideEquivalentIds: ["bookmark"],
  }),
  icon("book.svg", "Reading", {
    tags: ["library", "read", "reference"],
    lucideEquivalentIds: ["book"],
  }),
  icon("briefcase.svg", "Work", {
    tags: ["business", "job", "office"],
    lucideEquivalentIds: ["briefcase", "briefcase-business"],
  }),
  icon("brush.svg", "Design", {
    aliases: ["paintbrush"],
    tags: ["art", "paint", "creative"],
    lucideEquivalentIds: ["brush", "paintbrush"],
  }),
  icon("bug.svg", "Development", {
    tags: ["debug", "issue", "software"],
    lucideEquivalentIds: ["bug"],
  }),
  icon("build.svg", "Development", {
    name: "Build tools",
    aliases: ["tools"],
    tags: ["compile", "hammer", "wrench"],
    lucideEquivalentIds: ["wrench"],
  }),
  icon("cafe.svg", "Food & Drink", {
    name: "Cafe",
    aliases: ["coffee"],
    tags: ["drink", "cup", "break"],
    lucideEquivalentIds: ["coffee"],
  }),
  icon("call.svg", "Communication", {
    name: "Phone call",
    aliases: ["phone", "telephone", "contact"],
    tags: ["voice", "talk"],
    lucideEquivalentIds: ["phone", "phone-call"],
    lucideAllowedIds: ["contact"],
  }),
  icon("card.svg", "Finance", {
    name: "Payment card",
    aliases: ["credit card", "debit card"],
    tags: ["bank", "money", "payment"],
    lucideEquivalentIds: ["credit-card"],
  }),
  icon("chat.svg", "Communication", {
    aliases: ["message", "conversation"],
    tags: ["talk", "social"],
    lucideEquivalentIds: ["message-circle"],
  }),
  icon("checkbox.svg", "Symbols", {
    name: "Checkbox",
    aliases: ["check", "done"],
    tags: ["task", "complete", "tick"],
    lucideEquivalentIds: ["square-check"],
    lucideAllowedIds: ["check"],
  }),
  icon("circle.svg", "Shapes", {
    tags: ["round", "dot"],
    lucideEquivalentIds: ["circle"],
  }),
  icon("cloud.svg", "Weather", {
    tags: ["sky", "online", "storage"],
    lucideEquivalentIds: ["cloud"],
  }),
  icon("code.svg", "Development", {
    tags: ["programming", "developer", "source"],
    lucideEquivalentIds: ["code"],
  }),
  icon("coins.svg", "Finance", {
    tags: ["money", "cash", "currency"],
    lucideEquivalentIds: ["coins"],
  }),
  icon("construct.svg", "Development", {
    name: "Construction",
    aliases: ["build", "tools"],
    tags: ["work", "maintenance"],
    lucideEquivalentIds: ["construction"],
  }),
  icon("cutlery.svg", "Food & Drink", {
    aliases: ["utensils", "restaurant"],
    tags: ["fork", "knife", "meal"],
    lucideEquivalentIds: ["utensils"],
  }),
  icon("egg.svg", "Food & Drink", {
    tags: ["breakfast", "cook"],
    lucideEquivalentIds: ["egg"],
  }),
  icon("extension-puzzle.svg", "Development", {
    name: "Extension",
    aliases: ["puzzle", "addon", "add-on"],
    tags: ["plugin", "browser"],
    lucideEquivalentIds: ["puzzle"],
  }),
  icon("eye.svg", "Design", {
    aliases: ["view", "visible"],
    tags: ["watch", "preview"],
    lucideEquivalentIds: ["eye", "view"],
  }),
  icon("fast-food.svg", "Food & Drink", {
    name: "Fast food",
    aliases: ["burger", "hamburger"],
    tags: ["meal", "restaurant"],
    lucideEquivalentIds: ["hamburger"],
  }),
  icon("fish.svg", "Animals", {
    tags: ["sea", "ocean", "food"],
    lucideEquivalentIds: ["fish"],
  }),
  icon("flag.svg", "Flags", {
    tags: ["country", "nation", "goal"],
    lucideEquivalentIds: ["flag"],
  }),
  icon("flame.svg", "Nature", {
    aliases: ["fire", "hot"],
    tags: ["energy"],
    lucideEquivalentIds: ["flame"],
  }),
  icon("flask.svg", "Science", {
    aliases: ["laboratory", "experiment"],
    tags: ["chemistry", "research"],
    lucideEquivalentIds: ["flask-conical"],
  }),
  icon("folder.svg", "Files", {
    aliases: ["directory"],
    tags: ["organize", "collection"],
    lucideEquivalentIds: ["folder"],
  }),
  icon("game-controller.svg", "Entertainment", {
    name: "Game controller",
    aliases: ["gamepad", "gaming"],
    tags: ["play", "video game"],
    lucideEquivalentIds: ["gamepad", "gamepad-2"],
  }),
  icon("globe-1.svg", "Travel", {
    name: "Globe grid",
    aliases: ["world", "earth"],
    tags: ["international", "web"],
    lucideEquivalentIds: ["earth"],
    allowConceptVariant: true,
  }),
  icon("globe.svg", "Travel", {
    aliases: ["world", "earth"],
    tags: ["international", "web"],
    lucideEquivalentIds: ["globe"],
    allowConceptVariant: true,
  }),
  icon("grid-2x2.svg", "Layout", {
    name: "2 by 2 grid",
    aliases: ["tiles"],
    tags: ["layout", "dashboard"],
    lucideEquivalentIds: ["grid-2x2"],
  }),
  icon("grid-3x3.svg", "Layout", {
    name: "3 by 3 grid",
    aliases: ["apps", "tiles"],
    tags: ["layout", "dashboard"],
    lucideEquivalentIds: ["grid-3x3"],
  }),
  icon("heart.svg", "Symbols", {
    aliases: ["love", "favorite"],
    tags: ["like", "health"],
    lucideEquivalentIds: ["heart"],
  }),
  icon("ice-cream.svg", "Food & Drink", {
    name: "Ice cream",
    aliases: ["dessert"],
    tags: ["sweet", "food"],
    lucideEquivalentIds: ["ice-cream-bowl"],
    lucideAllowedIds: ["dessert"],
  }),
  icon("image.svg", "Media", {
    aliases: ["photo", "picture"],
    tags: ["gallery", "visual"],
    lucideEquivalentIds: ["image"],
  }),
  icon("inbox.svg", "Communication", {
    tags: ["mail", "messages", "receive"],
    lucideEquivalentIds: ["inbox"],
  }),
  icon("key.svg", "Security", {
    tags: ["password", "access", "login"],
    lucideEquivalentIds: ["key"],
  }),
  icon("layers.svg", "Design", {
    tags: ["stack", "collection", "layout"],
    lucideEquivalentIds: ["layers"],
  }),
  icon("leaf.svg", "Nature", {
    tags: ["plant", "green", "eco"],
    lucideEquivalentIds: ["leaf"],
  }),
  icon("lightning.svg", "Weather", {
    aliases: ["bolt", "zap"],
    tags: ["electric", "energy", "storm"],
    lucideEquivalentIds: ["bolt", "zap"],
  }),
  icon("location.svg", "Travel", {
    name: "Location pin",
    aliases: ["place", "pin"],
    tags: ["map", "destination"],
    lucideEquivalentIds: ["map-pin"],
    lucideAllowedIds: ["pin"],
  }),
  icon("lock-closed.svg", "Security", {
    name: "Lock",
    aliases: ["secure", "private"],
    tags: ["password", "closed"],
    lucideEquivalentIds: ["lock"],
  }),
  icon("logo-rss.svg", "Communication", {
    name: "RSS",
    aliases: ["feed", "syndication"],
    tags: ["news", "subscribe"],
    lucideEquivalentIds: ["rss"],
  }),
  icon("logo-usd.svg", "Finance", {
    name: "US dollar",
    aliases: ["dollar", "usd"],
    tags: ["money", "currency"],
    lucideEquivalentIds: ["circle-dollar-sign"],
  }),
  icon("mail.svg", "Communication", {
    aliases: ["email", "message"],
    tags: ["inbox", "letter"],
    lucideEquivalentIds: ["mail"],
  }),
  icon("map.svg", "Travel", {
    tags: ["directions", "navigation", "location"],
    lucideEquivalentIds: ["map"],
  }),
  icon("megaphone.svg", "Communication", {
    aliases: ["announcement", "broadcast"],
    tags: ["marketing", "loud"],
    lucideEquivalentIds: ["megaphone"],
  }),
  icon("moon.svg", "Weather", {
    tags: ["night", "dark", "sleep"],
    lucideEquivalentIds: ["moon"],
  }),
  icon("music.svg", "Entertainment", {
    aliases: ["song", "audio"],
    tags: ["note", "listen"],
    lucideEquivalentIds: ["music", "music-2"],
  }),
  icon("navigate.svg", "Travel", {
    name: "Navigation arrow",
    aliases: ["compass", "direction"],
    tags: ["route", "location"],
    lucideEquivalentIds: ["navigation"],
    lucideAllowedIds: ["compass"],
  }),
  icon("nuclear.svg", "Science", {
    aliases: ["radiation", "atomic"],
    tags: ["energy", "hazard"],
    lucideEquivalentIds: ["radiation"],
  }),
  icon("page.svg", "Files", {
    name: "Document",
    aliases: ["file", "paper"],
    tags: ["page", "text"],
    lucideEquivalentIds: ["file"],
  }),
  icon("palette.svg", "Design", {
    tags: ["color", "colour", "art", "theme"],
    lucideEquivalentIds: ["palette"],
  }),
  icon("paw.svg", "Animals", {
    name: "Paw print",
    aliases: ["pet"],
    tags: ["dog", "cat", "animal"],
    lucideEquivalentIds: ["paw-print"],
  }),
  icon("people.svg", "People", {
    aliases: ["users", "group", "team"],
    tags: ["social", "contacts"],
    lucideEquivalentIds: ["group", "users"],
  }),
  icon("pizza.svg", "Food & Drink", {
    tags: ["meal", "restaurant", "slice"],
    lucideEquivalentIds: ["pizza"],
  }),
  icon("planet.svg", "Science", {
    aliases: ["space", "saturn"],
    tags: ["astronomy", "world"],
    lucideEquivalentIds: ["orbit"],
    lucideAllowedIds: ["space"],
  }),
  icon("present.svg", "Events", {
    name: "Gift",
    aliases: ["present"],
    tags: ["birthday", "celebration"],
    lucideEquivalentIds: ["gift"],
  }),
  icon("rocket.svg", "Science", {
    aliases: ["launch", "spaceship"],
    tags: ["space", "startup"],
    lucideEquivalentIds: ["rocket"],
  }),
  icon("school.svg", "Education", {
    aliases: ["college", "university"],
    tags: ["learn", "study", "class"],
    lucideEquivalentIds: ["school"],
    lucideAllowedIds: ["university"],
  }),
  icon("shapes.svg", "Shapes", {
    aliases: ["geometry"],
    tags: ["circle", "square", "triangle"],
    lucideEquivalentIds: ["shapes"],
  }),
  icon("shirt.svg", "Shopping", {
    aliases: ["clothing", "t-shirt"],
    tags: ["fashion", "wear"],
    lucideEquivalentIds: ["shirt"],
  }),
  icon("skull.svg", "Symbols", {
    tags: ["danger", "death", "pirate"],
    lucideEquivalentIds: ["skull"],
  }),
  icon("squares.svg", "Layout", {
    aliases: ["tiles", "copy"],
    tags: ["multiple", "grid"],
    lucideEquivalentIds: ["copy"],
  }),
  icon("square.svg", "Shapes", {
    tags: ["box", "rectangle"],
    lucideEquivalentIds: ["square"],
  }),
  icon("star-1.svg", "Symbols", {
    name: "Star outline",
    aliases: ["favorite", "rating"],
    tags: ["bookmark", "special"],
    lucideEquivalentIds: ["star"],
    allowConceptVariant: true,
  }),
  icon("star.svg", "Symbols", {
    name: "Star filled",
    aliases: ["favorite", "rating"],
    tags: ["bookmark", "special"],
    allowConceptVariant: true,
  }),
  icon("stats-chart.svg", "Finance", {
    name: "Statistics chart",
    aliases: ["analytics", "graph"],
    tags: ["data", "growth", "business"],
    lucideEquivalentIds: ["chart-no-axes-column-increasing"],
  }),
  icon("sun.svg", "Weather", {
    tags: ["day", "light", "bright"],
    lucideEquivalentIds: ["sun"],
  }),
  icon("tada.svg", "Events", {
    name: "Celebration",
    aliases: ["party", "tada"],
    tags: ["confetti", "success"],
    lucideEquivalentIds: ["party-popper"],
  }),
  icon("terminal.svg", "Development", {
    aliases: ["console", "command line", "shell"],
    tags: ["code", "developer"],
    lucideEquivalentIds: ["terminal"],
    lucideAllowedIds: ["shell"],
  }),
  icon("ticket.svg", "Events", {
    tags: ["event", "admission", "travel"],
    lucideEquivalentIds: ["ticket"],
  }),
  icon("time.svg", "Productivity", {
    name: "Clock",
    aliases: ["time", "schedule"],
    tags: ["history", "watch"],
    lucideEquivalentIds: ["clock"],
  }),
  icon("trash.svg", "Files", {
    aliases: ["delete", "bin"],
    tags: ["remove", "discard"],
    lucideEquivalentIds: ["trash", "trash-2"],
    lucideAllowedIds: ["delete"],
  }),
  icon("triangle.svg", "Shapes", {
    tags: ["geometry", "delta"],
    lucideEquivalentIds: ["triangle"],
  }),
  icon("video.svg", "Media", {
    aliases: ["camera", "movie"],
    tags: ["record", "film"],
    lucideEquivalentIds: ["video"],
    lucideAllowedIds: ["camera"],
  }),
  icon("volume-high.svg", "Media", {
    name: "Volume high",
    aliases: ["speaker", "sound"],
    tags: ["audio", "loud"],
    lucideEquivalentIds: ["volume-2"],
    lucideAllowedIds: ["speaker"],
  }),
  icon("wallet.svg", "Finance", {
    tags: ["money", "payment", "cash"],
    lucideEquivalentIds: ["wallet"],
  }),
  icon("warning.svg", "Symbols", {
    aliases: ["alert", "caution"],
    tags: ["danger", "error"],
    lucideEquivalentIds: ["triangle-alert"],
  }),
  icon("water.svg", "Nature", {
    name: "Water drop",
    aliases: ["droplet", "rain"],
    tags: ["liquid", "weather"],
    lucideEquivalentIds: ["droplet"],
  }),
  icon("weight.svg", "Sports", {
    aliases: ["scale", "gym"],
    tags: ["fitness", "exercise", "mass"],
    lucideEquivalentIds: ["weight"],
    lucideAllowedIds: ["scale"],
  }),
]);
