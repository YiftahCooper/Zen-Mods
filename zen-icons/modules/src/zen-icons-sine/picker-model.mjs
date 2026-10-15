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
  function indexRecords(nextRecords, metadata) {
    mergedCategoryMetadata = mergeCategoryMetadata(metadata);
    const names = Object.keys(mergedCategoryMetadata);
    nextRecords = nextRecords.map(record => ({...record, categories: record.categories.map(name => {
      const canonical = canonicalCategoryName(name, names);
      if (!names.includes(canonical)) names.push(canonical);
      return canonical;
    })}));
    availableProviders = new Set(nextRecords.map((record) => record.provider));
    availableCategories = [
      ...new Set(nextRecords.map((record) => record.categories[0] || "Other")),
    ].sort(compareCategoryNames);
    presentations = Object.fromEntries(
      [
        ...new Set(
          nextRecords.flatMap((r) => r.categories).concat(availableCategories),
        ),
      ].map((category) => [
        category,
        categoryPresentation(category, mergedCategoryMetadata),
      ]),
    );
    records = nextRecords.map((record) => {
      const aliases = record.categories.flatMap(
        (category) => presentations[category]?.aliases ?? [],
      );
      return {
        ...record,
        tags: [...record.tags, ...aliases],
        searchTokens: [
          ...record.searchTokens,
          ...aliases.flatMap(tokenizeSearchText),
        ],
      };
    });
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
    },
    setQuery(value) {
      query = String(value ?? "").trim();
      navigationTarget = null;
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
    },

    navigateCategory(category) {
      query = "";
      navigationTarget = resolveAvailable(category);
      hiddenCategories.delete(categoryKey(navigationTarget));
    },

    setCategoryEnabled(category, enabled) {
      const key = categoryKey(resolveAvailable(category));
      if (enabled) hiddenCategories.delete(key);
      else hiddenCategories.add(key);
    },

    clearNavigationTarget() {
      navigationTarget = null;
    },

    snapshot() {
      const providers = new Set(enabledProviders);
      return {
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
    },
  };
}
