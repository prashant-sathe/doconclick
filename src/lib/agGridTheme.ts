import { ModuleRegistry, AllCommunityModule, themeQuartz } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

// Matches the site's existing `.data-table` look (globals.css) and the
// navy/green brand palette (`@theme` in globals.css) instead of AG Grid's
// default Quartz styling.
export const brandGridTheme = themeQuartz.withParams({
  accentColor: "hsl(162, 62%, 36%)",
  headerTextColor: "hsl(215, 16%, 47%)",
  headerBackgroundColor: "hsl(200, 25%, 98%)",
  headerFontWeight: 600,
  fontFamily: "inherit",
  fontSize: 14,
  headerHeight: 46,
  rowHeight: 54,
  cellHorizontalPadding: 20,
  borderColor: "hsl(220, 13%, 95%)",
  rowHoverColor: "hsl(160, 30%, 97.5%)",
  wrapperBorder: false,
  headerRowBorder: true,
  rowBorder: true,
});
