/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
/**
 * Used for storing names of variables that can be entered into NPC dialog via the inspector
 */
export class NPC_DialogVariables {
  public static ITEM_CATEGORY = '~category'
  public static ITEM_ID = '~itemid'

  public static replaceDialogVar(line: string, itemName: string, id: string) : string{
    line = line.replace(new RegExp(id, 'g'), itemName);
    return this.capitalizeAfterPunctuation(line)
  }

  static capitalizeAfterPunctuation(sentence: string): string {
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    return sentence.replace(/([.!?])\s*([a-z])/g, (match, p1, p2) => {
      return p1 + ' ' + p2.toUpperCase();
    });
  }
}