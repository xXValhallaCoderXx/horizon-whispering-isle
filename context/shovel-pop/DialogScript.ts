/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';
import { QuestData } from 'QuestData';
import { SubquestData } from 'SubquestData';

export class DialogScript extends hz.Component<typeof DialogScript> {
  static propsDefinition = {
    response: { type: hz.PropTypes.String },
    questUnlock: {type: hz.PropTypes.Entity },
    subquestComplete: {type: hz.PropTypes.Entity },
    option1: { type: hz.PropTypes.String },
    nextDialog1: { type: hz.PropTypes.Entity },
    option2: { type: hz.PropTypes.String },
    nextDialog2: { type: hz.PropTypes.Entity },
    option3: { type: hz.PropTypes.String },
    nextDialog3: { type: hz.PropTypes.Entity },
  };

  private static MAX_TREE_LENGTH: number = 16;

  private branchingDialogs: DialogScript[] = [];

  public questUnlock: (QuestData | undefined);
  public subquestComplete: (SubquestData<typeof SubquestData> | undefined);

  start() {
    this.questUnlock = this.props.questUnlock?.getComponents<QuestData>()[0];
    this.subquestComplete = this.props.subquestComplete?.getComponents<SubquestData<typeof SubquestData>>()[0];

    let branch = this.props.nextDialog1?.getComponents<DialogScript>()[0];
    if (branch){
      this.branchingDialogs.push(branch);

      branch = this.props.nextDialog2?.getComponents<DialogScript>()[0];
      if (branch){
        this.branchingDialogs.push(branch);

        branch = this.props.nextDialog3?.getComponents<DialogScript>()[0];
        if (branch){
          this.branchingDialogs.push(branch);
        }
      }
    }
  }

  public getDialogFromTree(key: number[]) : string[] {
    if (key.length === 0){
      return [this.props.response,
        this.props.option1,
        this.props.option2,
        this.props.option3]
    }else if (key.length >= DialogScript.MAX_TREE_LENGTH){
      return ["You talk too much!", "", "", ""] // Puts a limit on conversations that can loop back on themselves
    }

    let index = key[0];
    if (this.branchingDialogs[index] === undefined){
      return ["","","",""]
    }

    // traverse the tree until there are no more options
    key.shift();
    let result = this.branchingDialogs[index].getDialogFromTree(key);

    return result;
  }

  public getScriptFromTree(key: number[]) : DialogScript | undefined{
    if (key.length === 0){
      return this
    }

    let index = key[0];
    if (this.branchingDialogs[index] === undefined){
      return undefined; // no new script to navigate to for the chosen option
    }

    // traverse the tree until there are no more options
    key.shift();
    let result = this.branchingDialogs[index].getScriptFromTree(key);

    return result;
  }

  public getAllDialogsInTree() : DialogScript[] {
    let result: DialogScript[] = [this];

    // TODO: Don't know why this.branchingDialog isn't set up yet, even when moving it to preStart
    let branching = [];
    let branch = this.props.nextDialog1?.getComponents<DialogScript>()[0];
    if (branch){
      branching.push(branch);

      branch = this.props.nextDialog2?.getComponents<DialogScript>()[0];
      if (branch){
        branching.push(branch);

        branch = this.props.nextDialog3?.getComponents<DialogScript>()[0];
        if (branch){
          branching.push(branch);
        }
      }
    }

    this.questUnlock = this.props.questUnlock?.getComponents<QuestData>()[0];
    this.subquestComplete = this.props.subquestComplete?.getComponents<SubquestData<typeof SubquestData>>()[0] ?? this.subquestComplete;

    for (let i = 0; i < branching.length; i++) {
      result = result.concat(branching[i].getAllDialogsInTree());
    }

    return result;
  }
}
hz.Component.register(DialogScript);
