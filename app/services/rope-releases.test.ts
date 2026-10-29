import { describe, expect, it } from "vitest";
import {
  parseRopeReleaseCsv,
  ropeReleasesToCsv,
  type RopeRelease,
} from "./rope-releases.server";

describe("rope release CSV", () => {
  it("parses quoted values, commas, escaped quotes, and CRLF rows", () => {
    const records = parseRopeReleaseCsv(
      [
        "mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active",
        ',gid://shopify/Product/1,end_1,gid://shopify/ProductVariant/2,"Kausche, ""Edelstahl""",2,10,true',
      ].join("\r\n"),
    );

    expect(records).toEqual([
      {
        line: 2,
        values: {
          mapping_id: "",
          product_id: "gid://shopify/Product/1",
          position_code: "end_1",
          component_variant_id: "gid://shopify/ProductVariant/2",
          label: 'Kausche, "Edelstahl"',
          quantity: "2",
          sort_order: "10",
          active: "true",
        },
      },
    ]);
  });

  it("rejects malformed or incomplete CSV input", () => {
    expect(() => parseRopeReleaseCsv("mapping_id,product_id\nx,y")).toThrow(
      /CSV-Spalten müssen lauten/,
    );
    expect(() =>
      parseRopeReleaseCsv(
        'mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active\n,"unterminated',
      ),
    ).toThrow(/nicht geschlossenes Anführungszeichen/);
  });

  it("exports all required fields and neutralizes spreadsheet formulas", () => {
    const release: RopeRelease = {
      id: "gid://shopify/Metaobject/1",
      productId: "gid://shopify/Product/2",
      productTitle: "Seil",
      productHandle: "seil",
      positionCode: "end_1",
      positionLabel: "Endverbindung 1",
      componentVariantId: "gid://shopify/ProductVariant/3",
      componentVariantTitle: "Default",
      componentProductTitle: "Kausche",
      componentSku: "K-1",
      label: '=HYPERLINK("https://example.invalid")',
      quantity: 1,
      sortOrder: 10,
      active: true,
      linked: true,
    };

    expect(ropeReleasesToCsv([release])).toBe(
      [
        "mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active",
        '"gid://shopify/Metaobject/1","gid://shopify/Product/2","end_1","gid://shopify/ProductVariant/3","\'=HYPERLINK(""https://example.invalid"")","1","10","true"',
      ].join("\r\n"),
    );
  });
});
