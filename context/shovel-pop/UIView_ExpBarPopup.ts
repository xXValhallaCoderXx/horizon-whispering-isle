/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { allHudElementTypes, HUDElementType } from 'Enums';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import * as ui from 'horizon/ui';
import { Image, ImageSource, Text, View } from 'horizon/ui';
import { UI_Utils } from 'UI_Utils';
import { UIView_NoInteractionBase } from 'UIRoot_ChildrenBase';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';

export class UIView_ExpBarPopup extends UIView_NoInteractionBase {
  private progressBarPercent!: ui.AnimatedBinding;
  private currentLevel!: ui.Binding<string>;
  private expGained!: ui.Binding<string>;
  private verticalPosition!: ui.AnimatedBinding;

  private readonly defaultTextSize = 28;
  private readonly defaultLevelTextSize = 50;
  private readonly outlineSizeMult = 0.075; // How large the text outline should be as a fraction of the font size

  private readonly duration = 2400;
  private readonly animationDuration = 100;
  private readonly animationDelay = 300;

  rootPanelStyle: ui.ViewStyle = {
    width: "30%",
    height: "30%",
    position: "absolute",
    justifyContent: "flex-end", // Align vertical to the bottom
    alignContent: "center",
    alignSelf: "center",
    alignItems: "center", // Align horizontal to the middle
  }

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);

    this.uiRoot.connectNetworkBroadcastEvent(BigBox_ExpEvents.expUpdatedForPlayer, this.OnExpUpdatedForPlayer.bind(this));
    //this.uiRoot.sendNetworkBroadcastEvent(BigBox_ExpEvents.requestInitializeExpForPlayer, { player: this.localPlayer }, [this.uiRoot.world.getServerPlayer()]);
  }

  createView() {
    this.progressBarPercent = new ui.AnimatedBinding(0.8);
    this.currentLevel = new ui.Binding("0");
    this.expGained = new ui.Binding("+0 xp");
    this.verticalPosition = new ui.AnimatedBinding(0);

    const root = View({ //UIHUDTopArea
      children: [ View({ //XP Up Widget
          children: [ View({ //Level Widget
              children: [ View({ //BG Group
                  children: [ Image({ //icn_lvlBGL
                      source: ImageSource.fromTextureAsset(this.props.icn_lvlBGL!),
                      style: {
                          width: 44,
                          height: 44
                      }
                  }),
                  Image({ //icn_lvlBGC
                      source: ImageSource.fromTextureAsset(this.props.icn_lvlBGC!),
                      style: {
                          height: 44,
                          flexGrow: 1,
                          flexShrink: 0,
                          flexBasis: 0,
                          marginLeft: -2
                      }
                  }),
                  Image({ //icn_lvlBGR
                      source: ImageSource.fromTextureAsset(this.props.icn_lvlBGR!),
                      style: {
                          width: 44,
                          height: 44,
                          marginLeft: -2
                      }
                  }) ],
                  style: {
                      display: "flex",
                      height: 44,
                      alignItems: "flex-start",
                      alignSelf: "stretch",
                      flexDirection: "row"
                  }
              }),
              View({ //Text Group
                  children: [ Text({ // Lv.
                      text: "Lv.",
                      style: {
                          width: 33,
                          height: 35,
                          color: "#00343E",
                          fontSize: 24,
                          fontWeight: "700",
                          textAlign: "right"
                      }
                  }),
                  View({ //Spacer
                      style: {
                          width: 8,
                          height: 44
                      }
                  }),
                  Text({ // Level Number
                      text: this.currentLevel,
                      style: {
                          color: "#00343E",
                          fontSize: 32,
                          fontWeight: "700",
                          textAlign: "left"
                      }
                  }) ],
                  style: {
                      display: "flex",
                      paddingVertical: 0,
                      paddingHorizontal: 16,
                      alignItems: "flex-end",
                      marginTop: -44,
                      marginRight: 6,
                      flexDirection: "row"
                  }
              }) ],
              style: {
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
              }
          }),
          View({ //Progress Bar BG
              children: [ View({ //Fill
                  children: [  ],
                  style: {
                      width: this.progressBarPercent.interpolate([0, 1], [0, 492]),
                      height: 12,
                      borderRadius: 8,
                      backgroundColor: "#61CDB9",
                      position: "absolute",
                      left: 0,
                      top: 0
                  }
              }) ],
              style: {
                  display: "flex",
                  height: 20,
                  padding: 4,
                  justifyContent: "center",
                  alignItems: "center",
                  alignSelf: "stretch",
                  borderRadius: 12,
                  borderWidth: 4,
                  borderColor: "#DCF4DB",
                  backgroundColor: "#00343E",
                  marginTop: 4
              }
          }),
          View({
            children: [
              UI_Utils.outlinedText({ // XP Number
                text: this.expGained,
                style: {
                position: "absolute",
                color: "#DCF4DB",
                textAlign: "left",
                width: 400,
                fontSize: 28,
                fontWeight: "700",
                },
                outlineSize: 2,
                })
            ],
            style: {
              position: "absolute",
              bottom: -9,
              left: 710,
              top: 38
            }
          }),
        ],
          style: {
              display: "flex",
              width: 500,
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center"
          }
      }) ],
      style: {
          display: "flex",
          width: "100%",
          height: 100,
          padding: 16,
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "center",
          flexShrink: 0,
          position: "relative",
          top: this.verticalPosition.interpolate([0, 1], ["-30px", "0px"]),
      }
    })
    return root;
  }

  private OnExpUpdatedForPlayer(data: { player: hz.Player, currentLevel: number, percentExpToNextLevel: number, gainedExp: number, showToast: boolean }) {
    if ((this.localPlayer === data.player) && data.gainedExp > 0) {
      //this.entity.visible.set(true);
      this.expGained.set(`+${data.gainedExp} xp`, [this.localPlayer]);
      this.progressBarPercent.set(x => {
        if (x > data.percentExpToNextLevel) {
          return 0;
        }
        else {
          return x;
        }
      }, undefined, [this.uiRoot.world.getLocalPlayer()]);

      //this.progressBarPercent.set(data.percentExpToNextLevel);
      this.currentLevel.set(data.currentLevel.toString(), [this.localPlayer]);

      this.uiRoot.async.setTimeout(() => {
        this.progressBarPercent.set(ui.Animation.timing(data.percentExpToNextLevel, { duration: 100, easing: ui.Easing.inOut(ui.Easing.ease) }), undefined, [this.localPlayer]);
      }, 600);

      // Animate the view down
      if (data.showToast) {
        const context = "exp_bar_popup";
        this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context, exclude: allHudElementTypes & ~HUDElementType.Location })
        this.uiRoot.async.setTimeout(() => {
          this.verticalPosition.set((ui.Animation.timing(1, { duration: this.animationDuration, easing: ui.Easing.inOut(ui.Easing.ease) })), undefined, [this.localPlayer]);
          this.uiRoot.async.setTimeout(() => {
            // Animate the view up
            this.verticalPosition.set((ui.Animation.timing(0, { duration: this.animationDuration, easing: ui.Easing.inOut(ui.Easing.ease) })), undefined, [this.localPlayer]);
            this.uiRoot.async.setTimeout(() => {
              //this.entity.visible.set(false);
              this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context });
            }, this.animationDuration);
          }, this.duration);
        }, this.animationDelay);
      }
    }
  }
}
