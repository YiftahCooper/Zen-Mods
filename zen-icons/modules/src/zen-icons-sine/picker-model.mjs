import {
  groupIconRecords,
  ICON_PROVIDERS,
  tokenizeSearchText,
} from "../zen/common/emojis/ZenIconRegistry.mjs";
import {
  categoryPresentation,
  compareCategoryNames,
  mergeCategoryMetadata,
  resolveCategoryName,
  categoryKey,
  canonicalCategoryName,
  categoryDisplayName,
} from "../zen/common/emojis/ZenIconCategories.mjs";

// Derived picker records are reused per input record while their canonical
// categories and aliases are unchanged. Records are immutable, so the registry's
// identity-keyed search index survives catalogue refreshes and picker reopenings
// instead of re-normalising every record on the first keystroke of each open.
// Entries are weak: replaced custom records release their derived copies.
const derivedRecords = new WeakMap();
function derivedRecord(record, categories, aliases) {
  const key = `${categories.join("")}${aliases.join("")}`;
  const cached = derivedRecords.get(record);
  if (cached?.key === key) return cached.value;
  const value = {
    ...record,
    categories,
    tags: [...record.tags, ...aliases],
    searchTokens: [
      ...record.searchTokens,
      ...aliases.flatMap(tokenizeSearchText),
    ],
  };
  derivedRecords.set(record, { key, value });
  return value;
}

export function createPickerModel(
  records,
  {
    onlyIcons = false,
    categoryMetadata = {},
    defaultKind = onlyIcons ? "folder" : "space",
    disabledProviders = [],
    disabledCategories = [],
  } = {},
) {
  const hiddenProviders = new Set(disabledProviders);
  const hiddenCategories = new Set(disabledCategories.map(categoryKey));
  let availableProviders,
    availableCategories,
    mergedCategoryMetadata,
    presentations;
  // snapshot() is pure over this model's state; mutators clear the memo.
  let cachedSnapshot = null;
  function indexRecords(nextRecords, metadata) {
    mergedCategoryMetadata = mergeCategoryMetadata(metadata);
    const names = Object.keys(mergedCategoryMetadata);
    const categoriesByRecord = nextRecords.map(record => record.categories.map(name => {
      const canonical = canonicalCategoryName(name, names);
      if (!names.includes(canonical)) names.push(canonical);
      return canonical;
    }));
    availableProviders = new Set(nextRecords.map((record) => record.provider));
    availableCategories = [
      ...new Set(categoriesByRecord.map((categories) => categories[0] || "Other")),
    ].sort(compareCategoryNames);
    presentations = Object.fromEntries(
      [
        ...new Set(
          categoriesByRecord.flat().concat(availableCategories),
        ),
      ].map((category) => [
        category,
        categoryPresentation(category, mergedCategoryMetadata),
      ]),
    );
    records = nextRecords.map((record, index) => {
      const categories = categoriesByRecord[index];
      const aliases = categories.flatMap(
        (category) => presentations[category]?.aliases ?? [],
      );
      return derivedRecord(record, categories, aliases);
    });
    cachedSnapshot = null;
  }
  indexRecords(records, categoryMetadata);
  const enabledProviders = new Set(
    ICON_PROVIDERS.filter(
      (provider) =>
        availableProviders.has(provider) &&
        !hiddenProviders.has(provider) &&
        !(onlyIcons && provider === "emoji"),
    ),
  );
  let query = "";
  let navigationTarget = null;
  const resolveAvailable=value=>availableCategories.find(name=>categoryKey(name)===categoryKey(value)) ??
    availableCategories.find(name=>categoryKey(categoryDisplayName(name,availableCategories))===categoryKey(value)) ??
    canonicalCategoryName(resolveCategoryName(value,mergedCategoryMetadata),availableCategories);

  return {
    updateRecords(nextRecords, metadata = {}) {
      const previousProviders = availableProviders;
      indexRecords(nextRecords, metadata);
      for (const provider of availableProviders) {
        if (
          !previousProviders.has(provider) &&
          !hiddenProviders.has(provider) &&
          !(onlyIcons && provider === "emoji")
        )
          enabledProviders.add(provider);
      }
      cachedSnapshot = null;
    },
    setQuery(value) {
      query = String(value ?? "").trim();
      navigationTarget = null;
      cachedSnapshot = null;
    },

    setProviderEnabled(provider, enabled) {
      if (
        !availableProviders.has(provider) ||
        (onlyIcons && provider === "emoji")
      ) {
        return;
      }
      if (enabled) {
        enabledProviders.add(provider);
      } else {
        enabledProviders.delete(provider);
      }
      cachedSnapshot = null;
    },

    navigateCategory(category) {
      query = "";
      navigationTarget = resolveAvailable(category);
      hiddenCategories.delete(categoryKey(navigationTarget));
      cachedSnapshot = null;
    },

    setCategoryEnabled(category, enabled) {
      const key = categoryKey(resolveAvailable(category));
      if (enabled) hiddenCategories.delete(key);
      else hiddenCategories.add(key);
      cachedSnapshot = null;
    },

    clearNavigationTarget() {
      navigationTarget = null;
      cachedSnapshot = null;
    },

    snapshot() {
      if (cachedSnapshot) return cachedSnapshot;
      const providers = new Set(enabledProviders);
      cachedSnapshot = {
        query,
        onlyIcons,
        enabledProviders: ICON_PROVIDERS.filter((provider) =>
          providers.has(provider),
        ),
        availableProviders: ICON_PROVIDERS.filter((provider) =>
          availableProviders.has(provider),
        ),
        availableCategories,
        disabledCategories: availableCategories.filter(name => hiddenCategories.has(categoryKey(name))),
        hiddenCategoryNames: [...hiddenCategories],
        navigationTarget,
        defaultChoice: {
          kind: defaultKind,
          label:
            defaultKind === "folder"
              ? "Default Folder Icon"
              : defaultKind === "tab" ? "Default Tab Icon" : "Default Space Icon",
          value: null,
        },
        groups: groupIconRecords(records, { query, providers }).filter(group => !hiddenCategories.has(categoryKey(group.category))).map((group) => {
          const presentation = presentations[group.category];
          return {
            ...group,
            categoryName: categoryDisplayName(group.category,availableCategories),
            categoryIcon: presentation.icon,
            categoryImages: presentation.imageSources || [],
            categoryLabel: presentation.label,
            categoryAliases: presentation.aliases,
          };
        }),
        categoryPresentations: presentations,
      };
      return cachedSnapshot;
    },
  };
}
