/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import { Binding, Image, ImageSource, Pressable, Text, UINode, View } from 'horizon/ui';
import { HUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { Logger } from 'Logger';
import { Shovel } from 'Shovel';
import { ShovelData } from 'ShovelData';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';
import { UIView_InteractionNonBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';

const log = new Logger("UIView_ShovelWidget");

export class UIView_ShovelWidget extends UIView_InteractionNonBlockingBase {
  private hudElementVisible!: HUDElementVisibilityTracker;
  private shovelData: ShovelData | undefined;

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);

    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.DigMinigameUsefulWidget);
    this.hudElementVisible.connect(this.uiRoot);

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (payload) => {
      log.info("received this.localPlayerShovelChanged event shoveldata " + payload.shovelData);
      this.shovelData = payload.shovelData;
      this.onShovelDataUpdate();
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.localSetShovelLevel, () => {
      this.setShovelLevel();
    })

    this.uiRoot.connectLocalBroadcastEvent(Events.canUpgradeAnyShovelUpdated, payload => {
      log.info("canupgradeany shovel " + payload.canUpgradeAny);
      this.canUpgradeAny.set(payload.canUpgradeAny, [this.localPlayer]);
    });

    this.uiRoot.sendLocalBroadcastEvent(Events.requestUpgradeAnyShovelUpdated, {});

    this.shovelImage = new Binding(ImageSource.fromTextureAsset(this.props.missingTexture!));
  }

  shovelNameText = new Binding<string>("UFO Shovel");
  shovelLevelText = new Binding<string>("88");
  shovelImage!: Binding<ImageSource>;
  private canUpgradeAny = new Binding(false);

  private onShovelDataUpdate() {
    if (this.shovelData === undefined) {
      return;
    }
    let textureAsset = this.shovelData.getIconAsset()!;
    if (textureAsset === undefined) {
      log.error("Shovel icon texture is not defined");
      textureAsset = this.props.missingTexture!;
    }
    const target = [this.localPlayer]
    this.shovelImage.set(ImageSource.fromTextureAsset(textureAsset), target);
    this.setShovelLevel();
    this.shovelNameText.set(`${this.shovelData.name} Shovel`, target);
  }

  private setShovelLevel() {
    if (this.shovelData === undefined) {
      return;
    }

    this.shovelLevelText.set(`${Shovel.getLevel(this.shovelData.id) + 1}`, [this.localPlayer]);
  }

  onClicked() {
    const target = [this.localPlayer]
    this.uiRoot.sendLocalBroadcastEvent(ShovelProgressionEvents.requestToggleShovelInventory, {});
    this.uiRoot.sendNetworkBroadcastEvent(Shovel.equip, this.localPlayer, target);
    this.canUpgradeAny.set(false, target);
  }

  createView() {
    const root = View({ //UIShovelLevelWIdget
      children: [
        Pressable({ //Shovel WIdget
          children: [
            View({ //Contents
              children: [
                View({ //Horizontal level star group
                  children: [
                    Text({ // 88
                      text: this.shovelLevelText,
                      style: {
                        color: "#5C3B1B",
                        textAlign: "center",
                        textAlignVertical: "center",
                        fontFamily: "Roboto",
                        fontSize: 20,
                        fontWeight: "900"
                      }
                    }),
                    Image({ //icn_star
                      source: ImageSource.fromTextureAsset(this.props.icn_star!),
                      style: {
                        width: 20,
                        height: 20,
                        resizeMode: "cover",
                        tintColor: "#5C3B1B"
                      }
                    }),
                  ],
                  style: {
                    display: "flex",
                    justifyContent: "center",
                    width: "100%",
                    alignItems: "center",
                    flexDirection: "row",
                    borderRadius: 10,
                    // backgroundColor: "#CCA10A"
                  }
                }),

                View({ //Shovel Group
                  children: [
                    Image({ //icn_shovel
                      source: this.shovelImage,
                      style: {
                        width: 56,
                        height: 56,
                        transform: [
                          {
                            rotate: "28.955deg"
                          }
                        ],
                        flexShrink: 0
                      }
                    })],
                  style: {
                    display: "flex",
                    width: 45,
                    height: 45,
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: -4
                  }
                }),

              ],
              style: {
                display: "flex",
                width: 64,
                height: 72,
                paddingVertical: 4,
                paddingHorizontal: 0,
                justifyContent: "center",
                alignItems: "center",
                flexShrink: 0,
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
                backgroundColor: "#FFCB5C",
                borderBottomWidth: 4,
                borderColor: "#CCA855",
                flexDirection: "column",
                position: "absolute",
                left: 0,
                top: 0
              }
            }),
            UINode.if(this.canUpgradeAny, View({
              children: [
                Image({ //icn_shovel
                  source: ImageSource.fromTextureAsset(this.props.icn_arrowLevelUp!),
                  style: {
                    top: 3,
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    alignSelf: "center"
                  }
                })
              ],
              style: {
                backgroundColor: "red",
                borderRadius: 12,
                borderColor: "red",
                width: 24,
                height: 24,
                position: "absolute",
                top: -4,
                right: -8
              }
            }))
          ],
          style: {
            width: 64,
            height: 72,
            flexShrink: 0,
            position: "absolute",
            right: 108,
            top: 166
          },
          onClick: () => this.onClicked(),
        })],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        justifyContent: "flex-end",
        alignItems: "center",
        flexShrink: 0,
        position: "absolute"
      }
    })

    return UINode.if(this.hudElementVisible.isVisible(), root);
  }
}
