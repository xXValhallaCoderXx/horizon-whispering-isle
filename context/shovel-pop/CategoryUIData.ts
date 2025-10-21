/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Color } from "horizon/core";

const categories: CategoryUIDataEntry[] = [{
    id: "Food",
    displayName: "Food",
    color: Color.fromHex("#FFDD41")  // Yellow
  },
  {
    id: "Italian",
    displayName: "Italian",
    color: Color.fromHex("#C6463D")  // Dark Red
  },
  {
    id: "Wood",
    displayName: "Wood",
    color: Color.fromHex("#9D8E6F")  // Bronze-y
  },
  {
    id: "Object",
    displayName: "Generic",
    color: Color.fromHex("#B0B0B0")  // Gray
  },
  {
    id: "Creature",
    displayName: "Creature",
    color: Color.fromHex("#C6463D")  // Dark Red
  },
  {
    id: "Botanic",
    displayName: "Botanic",
    color: Color.fromHex("#1BA500")  // Dark Green
  },
  {
    id: "IceQueen",
    displayName: "Ice Queen",
    color: Color.fromHex("#40DBD9")  // Light Blue
  },
  {
    id: "Alien",
    displayName: "Alien",
    color: Color.fromHex("#C957BA")  // Purple
  },
  {
    id: "Ancient",
    displayName: "Ancient",
    color: Color.fromHex("#DB9840")  // Orange
  },
  {
    id: "Divine",
    displayName: "Divine",
    color: Color.fromHex("#9D8E6F")  // Bronze-y
  },
  {
    id: "Toy",
    displayName: "Toy",
    color: Color.fromHex("#FFDD41")  // Yellow
  },
  {
    id: "Paper",
    displayName: "Paper",
    color: Color.fromHex("#B0B0B0")  // Gray
  },
  {
    id: "Aquatic",
    displayName: "Aquatic",
    color: Color.fromHex("#40DBD9")  // Light Blue
  },
  {
    id: "Navigation",
    displayName: "Navigation",
    color: Color.fromHex("#9D8E6F")  // Bronze-y
  },
  {
    id: "Final",
    displayName: "Final",
    color: Color.fromHex("#C6463D")  // Dark Red
  },
  {
    id: "Monstrous",
    displayName: "Monstrous",
    color: Color.fromHex("#1BA500")  // Dark Green
  },
  {
    id: "Fossil",
    displayName: "Fossil",
    color: Color.fromHex("#DB9840")  // Orange
  },
  {
    id: "IcePop",
    displayName: "Ice Cream",
    color: Color.fromHex("#40DBD9")  // Light Blue
  },
  {
    id: "Magical",
    displayName: "Magical",
    color: Color.fromHex("#FFDD41")  // Yellow
  },
  {
    id: "Life",
    displayName: "Life",
    color: Color.fromHex("#1BA500")  // Dark Green
  },
]

const missingCategory: CategoryUIDataEntry = {
  id: "",
  displayName: "<MISSING>",
  color: Color.black
}

export class CategoryUIData {
  public static get(id: string) {
    for (let i = 0; i < categories.length; ++i) {
      if (categories[i].id == id) {
        return categories[i];
      }
    }
    return missingCategory;
  }
  private constructor() {}
}

type CategoryUIDataEntry = {
  id: string,
  displayName: string,
  color: Color,
}
