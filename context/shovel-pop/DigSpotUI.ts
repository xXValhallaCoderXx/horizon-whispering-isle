/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import { DigSpotParams, Events } from 'Events';
import { wait } from 'GameUtils';
import { Color, Entity, Player, PropTypes, Vec3, World } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, ColorValue, Easing, Image, ImageSource, Text, UIComponent, UINode, View } from 'horizon/ui';
import { HUDAnimations } from 'HUDAnimations';
import { AnimatedHUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { ItemContainer } from 'ItemContainer';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { IWorldUI, PlayerWorldUI } from 'PlayerWorldUI';
import { Shovel } from 'Shovel';

const SCALE_SPEED = 3;

const log = new Logger('DigSpotUI');

export class DigSpotUI extends UIComponent<typeof DigSpotUI> implements IWorldUI {
  static propsDefinition = {
    missingImage: { type: PropTypes.Asset },
    playerWorldUI: { type: PropTypes.Entity },
    icn_shovelBG: { type: PropTypes.Asset },
    icn_shovel: { type: PropTypes.Asset },
    icn_dice: { type: PropTypes.Asset },
    icn_triangleD: { type: PropTypes.Asset },
    icn_bubble: { type: PropTypes.Asset },
    icn_star: { type: PropTypes.Asset },
  };

  panelHeight = 800;
  panelWidth = 2128;

  private localPlayer!: Player;
  private parent!: Entity;
  private emptyImage!: ImageSource;
  private targetParams?: DigSpotParams;
  private currentParams?: DigSpotParams;
  private hudElementVisible!: AnimatedHUDElementVisibilityTracker;

  private itemImage!: Binding<ImageSource>;
  private chanceTextScale!: AnimatedBinding;
  private chanceText!: Binding<string>;
  private show!: Binding<boolean>;
  private showBubble!: Binding<boolean>;
  private bubbleSmlOpacity!: AnimatedBinding;
  private bubbleLrgOpacity!: AnimatedBinding;
  private bubbleFinalOpacity!: AnimatedBinding;
  private starRequirement!: Binding<string>;
  private useStarRequirement!: Binding<boolean>;
  private bubbleText!: Binding<string>;
  private bubbleTextTint!: Binding<string>;
  private showShovelRequirement!: Binding<boolean>;
  private shovelImage!: Binding<ImageSource>;
  private rarityTint!: Binding<ColorValue>;
  private percentageTintColor!: Binding<ColorValue>;
  private scale = 0;

  private showingBubbleCache = false;
  private delayUpdatePercentage = false;

  id: number = 0;

  start() {
    this.localPlayer = this.world.getLocalPlayer();
    if (this.localPlayer === this.world.getServerPlayer()) {
      //this.entity.visible.set(false)
      // setting this to false will cause the entity to not be visible in the editor
      // instead, all of the individual entities are set to false in the editor
      return;
    }
    this.entity.visible.set(true);
    this.async.setInterval(() => {
      if (!this.entity.visible.get()) {
        this.entity.visible.set(true);
      }
    }, 5000);
    this.parent = this.entity.parent.get()!;
    this.connectLocalBroadcastEvent(World.onUpdate, (data) => this.update(data.deltaTime));

    this.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (data) => {
      this.updateToTargetParams();
    })

    this.connectLocalBroadcastEvent(Events.localSetShovelLevel, () => {
      this.updateToTargetParams();
    })

    this.addDigSpotUIWhenReady();
    this.hudElementVisible.connect(this);
  }

  private async addDigSpotUIWhenReady() {
    while (true) {
      const worldUI = this.props.playerWorldUI!.getComponents<PlayerWorldUI>()[0];
      if (worldUI != null) {
        worldUI.addDigSpotUI(this);
        break;
      }
      await wait(this, 100);
    }
  }

  set(spotId: number, params: DigSpotParams, delayUpdatePercentage: boolean) {
    log.debug(`Setting spot ${spotId} to ${params.position} with ${params.itemId} and ${params.percentage}\nCurrent: ${this.id} ${this.targetParams?.position} ${this.targetParams?.itemId} ${this.targetParams?.percentage}`);
    if (this.targetParams?.position === params.position && this.targetParams?.itemId === params.itemId) {
      if (this.targetParams.percentage !== params.percentage) {
        this.targetParams.percentage = params.percentage;

        this.delayUpdatePercentage = delayUpdatePercentage;

        if (!delayUpdatePercentage) {
          this.updateChanceText(params.percentage);
          // this.chanceTextScale.set(Animation.sequence(
          //   Animation.timing(1.3, { duration: 300, easing: Easing.linear}),
          //   Animation.timing(1, { duration: 300, easing: Easing.linear})
          // ), undefined, [this.localPlayer]);
          log.info("Updating chance text because of set");
        }
      }
    }
    this.id = spotId;
    this.targetParams = { ...params };
  }

  private update(deltaTime: number) {
    let isDirty = false;
    if (this.currentParams != this.targetParams) {
      this.scale = Math.max(0, this.scale - deltaTime * SCALE_SPEED);
      isDirty = true;
      if (this.scale === 0) {
        this.currentParams = this.targetParams;
        this.updateToTargetParams();

        // No bubble until we scale back up
        this.showBubble.set(false, [this.localPlayer]);
        this.bubbleFinalOpacity.set(0, undefined, [this.localPlayer]);
        this.bubbleLrgOpacity.set(0, undefined, [this.localPlayer]);
        this.bubbleSmlOpacity.set(0, undefined, [this.localPlayer]);
        this.showingBubbleCache = false;
      }
    } else if (this.currentParams && this.currentParams.itemId !== "" && this.scale < 1) {
      this.scale = Math.min(1, this.scale + deltaTime * SCALE_SPEED);
      isDirty = true;
    }
    if (isDirty) {
      this.entity.transform.localScale.set(new Vec3(this.scale, this.scale, this.scale));
      this.entity.transform.localPosition.set(new Vec3(0, -2 + 2 * this.scale, 0));


      if (this.scale === 1) {
        // bubble cache
        this.showingBubbleCache = false;
        this.updateToTargetParams();
      }
    }
  }

  private updateToTargetParams() {
    if (!this.targetParams) {
      log.info(`updateToTargetParams: No target params (${this.id})`);
      this.show.set(false, [this.localPlayer]);
      return;
    }

    if (this.targetParams.itemId === "") {
      log.info(`updateToTargetParams: No item ID (${this.id})`);
      this.show.set(false, [this.localPlayer]);
      return;
    }

    if (!ItemContainer.localInstance) {
      log.warn(`updateToTargetParams: ItemContainer not initialized (${this.id})`)
      this.show.set(false, [this.localPlayer]);
      return;
    }


    if (!Shovel.localInstance) {
      log.warn(`updateToTargetParams: Shovel not initialized (${this.id})`)
      this.show.set(false, [this.localPlayer]);
      return;
    }

    const itemData = ItemContainer.localInstance.getItemDataForId(this.targetParams.itemId);
    if (!itemData) {
      this.itemImage.set(this.emptyImage, [this.localPlayer]);
      this.show.set(false, [this.localPlayer]);
      log.info(`updateToTargetParams: Item data not found (${this.id})`)
      return;
    }
    this.show.set(true, [this.localPlayer]);
    let itemImage = this.emptyImage;
    const iconAsset = itemData.getIconAsset();
    if (iconAsset) {
      itemImage = ImageSource.fromTextureAsset(iconAsset);
    }
    this.itemImage.set(itemImage, [this.localPlayer]);

    this.rarityTint.set(ItemUtils.RARITY_HEX_COLORS[itemData.rarity], [this.localPlayer]);

    if (!this.delayUpdatePercentage) {
      this.updateChanceText(this.targetParams.percentage);
    }

    // Required Shovel
    const requiredShovelData = Shovel.getData(itemData.requiredShovels, 0);
    if (requiredShovelData) {
      const iconAsset = requiredShovelData.getIconAsset();
      if (iconAsset) {
        this.shovelImage.set(ImageSource.fromTextureAsset(iconAsset), [this.localPlayer]);
      }
    }
    this.showShovelRequirement.set(requiredShovelData != null, [this.localPlayer]);

    let useBubble = false;
    let useStarRequirement = false;
    let bubbleText = "";
    let bubbleTextTint = "#F02849";
    // Check shovel is the right type
    const shovelData = Shovel.localInstance.equippedData;
    if (itemData.requiredShovels && shovelData.getBaseId() !== itemData.requiredShovels) {
      useBubble = true;
      useStarRequirement = false;
      const requiredShovelData = Shovel.getData(itemData.requiredShovels, 0);
      bubbleText = `${requiredShovelData?.name} Shovel Required`;
    }
    if (!useBubble) {
      // Check if star requirement is met
      const shovelLevel = Shovel.getLevel(shovelData.id) + 1;
      if (shovelLevel < this.targetParams.starRequirement) {
        useBubble = true;
        useStarRequirement = true;
        bubbleText = "Shovel\nRequired";
      }
    }
    if (!useBubble) {
      // Then check if rate up is higher
      // actually we will show the bubble later
    }

    if (this.showingBubbleCache != useBubble) {
      if (useBubble) {
        this.animateBubbleIn();
      }
      else {
        this.animateBubbleOut();
      }
      this.showingBubbleCache = useBubble;
    }

    this.starRequirement.set(this.targetParams.starRequirement.toString(), [this.localPlayer]);
    this.useStarRequirement.set(useStarRequirement, [this.localPlayer]);
    this.bubbleText.set(bubbleText, [this.localPlayer]);
    this.bubbleTextTint.set(bubbleTextTint, [this.localPlayer]);

    this.parent.position.set(this.targetParams.position);
    log.info(`updated to target params ${this.targetParams.position}`)
  }

  updateChanceText(percentage: number) {
    let chanceText = "";
    const chance = percentage;
    if (chance <= 0) {
      chanceText = "0%";
    } else if (chance < .01) {
      chanceText = "<1%";
    } else if (chance >= 1) {
      chanceText = "100%";
    } else {
      chanceText = Math.floor(chance * 100) + "%";
    }
    this.chanceText.set(chanceText, [this.localPlayer]);
  }

  animateBubbleIn() {
    this.showBubble.set(true, [this.localPlayer]);
    this.bubbleSmlOpacity.set(Animation.timing(1, { duration: 300, easing: Easing.linear }), undefined, [this.localPlayer]);
    this.async.setTimeout(() => {
      this.bubbleLrgOpacity.set(Animation.timing(1, { duration: 300, easing: Easing.linear }), undefined, [this.localPlayer]);
    }, 300);
    this.async.setTimeout(() => {
      this.bubbleFinalOpacity.set(Animation.timing(1, { duration: 300, easing: Easing.linear }), undefined, [this.localPlayer]);
    }, 600);
  }

  animateBubbleOut() {
    this.bubbleFinalOpacity.set(Animation.timing(0, { duration: 300, easing: Easing.linear }), undefined, [this.localPlayer]);
    this.bubbleLrgOpacity.set(Animation.timing(0, { duration: 300, easing: Easing.linear }), undefined, [this.localPlayer]);
    this.bubbleSmlOpacity.set(Animation.timing(0, { duration: 300, easing: Easing.linear }), undefined, [this.localPlayer]);
    this.async.setTimeout(() => {
      this.showBubble.set(false, [this.localPlayer]);
    }, 300);
  }

  showDigAttemptedBubble() {
    if (this.targetParams!.digsAttempted > 0) {
      let useStarRequirement = false;
      let bubbleText = "Getting closer!\nTry again!";
      let bubbleTextTint = "#31A24C";

      this.useStarRequirement.set(useStarRequirement, [this.localPlayer]);
      this.bubbleText.set(bubbleText, [this.localPlayer]);
      this.bubbleTextTint.set(bubbleTextTint, [this.localPlayer]);

      this.animateBubbleIn();

      this.async.setTimeout(() => {
        this.animateBubbleOut();
      }, 5000);
    }
  }

  onSetVisible(isShown: boolean) {
    log.info("onSetVisible " + isShown);

    if (isShown) {
      if (this.targetParams && this.delayUpdatePercentage) {
        log.info("Updating chance text because of visiblity");
        this.async.setTimeout(() => {
          this.percentageTintColor.set("#FC8A07", [this.localPlayer]);
          this.async.setTimeout(() => {
            this.updateChanceText(this.targetParams!.percentage);
          }, 100);

          this.chanceTextScale.set(Animation.sequence(
            Animation.timing(2.2, { duration: 300, easing: Easing.linear }),
            Animation.timing(1, { duration: 300, easing: Easing.linear })
          ), () => {
            this.percentageTintColor.set("#31A24C", [this.localPlayer]);
            this.showDigAttemptedBubble();
          }, [this.localPlayer]);

          this.delayUpdatePercentage = false;
        }, 200);
      }
    }
  }

  initializeUI(): UINode {
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_shovelBG!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_shovel!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_dice!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_triangleD!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_bubble!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.icn_star!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }
    const setVisibleFunction = (isShown: boolean) => this.onSetVisible(isShown);
    this.hudElementVisible = new AnimatedHUDElementVisibilityTracker(HUDElementType.WorldUI_DigSpot, HUDAnimations.digSpotAnimation, setVisibleFunction);
    this.emptyImage = ImageSource.fromTextureAsset(this.props.missingImage!);
    this.itemImage = new Binding<ImageSource>(this.emptyImage);
    this.chanceTextScale = new AnimatedBinding(1);
    this.chanceText = new Binding<string>("");
    this.show = new Binding<boolean>(false);
    this.showBubble = new Binding<boolean>(false);
    this.bubbleSmlOpacity = new AnimatedBinding(0);
    this.bubbleLrgOpacity = new AnimatedBinding(0);
    this.bubbleFinalOpacity = new AnimatedBinding(0);
    this.starRequirement = new Binding<string>("1");
    this.useStarRequirement = new Binding<boolean>(false);
    this.bubbleText = new Binding<string>("");
    this.bubbleTextTint = new Binding<string>("#FFF");
    this.showShovelRequirement = new Binding<boolean>(false);
    this.shovelImage = new Binding<ImageSource>(this.emptyImage);
    this.rarityTint = new Binding<ColorValue>(Color.white);
    this.percentageTintColor = new Binding<ColorValue>("#31A24C");

    const root = View({ //UISpacialItemWidget
      children: [
        View({ //SpacialItemWidget
          children: [
            View({ //ChanceGroup
              children: [Image({ //icn_dice
                source: ImageSource.fromTextureAsset(this.props.icn_dice!),

                style: {
                  width: 100,
                  height: 100,
                  tintColor: "#31A24C",
                }
              }),
              Text({ // Percentage Text
                text: this.chanceText,
                style: {
                  color: this.percentageTintColor,
                  textAlign: "center",
                  textAlignVertical: "center",
                  fontFamily: "Roboto",
                  fontSize: 90,
                  fontWeight: "900",
                  marginLeft: 24,
                  transform: [{ scale: this.chanceTextScale }]
                }
              }),
              ],
              style: {
                display: "flex",
                paddingTop: 16,
                height: 134,
                paddingRight: 32,
                paddingBottom: 24,
                paddingLeft: 32,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 48,
                backgroundColor: "#FFF9E7",
                flexDirection: "row",
              }
            }),
            View({ //ItemCoin
              children: [View({ //OuterFrame
                style: {
                  width: 416,
                  height: 416,
                  flexShrink: 0,
                  borderRadius: 208,
                  borderWidth: 16,
                  borderColor: "#FFF9E7",
                  backgroundColor: "#FFF1C1",
                  position: "absolute",
                  left: 0,
                  top: 0
                }
              }),
              View({ //RarityFrame
                style: {
                  width: 384,
                  height: 384,
                  flexShrink: 0,
                  borderRadius: 192,
                  borderWidth: 16,
                  borderColor: this.rarityTint,
                  position: "absolute",
                  left: 16,
                  top: 16
                }
              }),
              Image({ //icn_item
                source: this.itemImage,
                style: {
                  width: 300,
                  height: 300,
                  flexShrink: 0,
                  resizeMode: "cover",
                  position: "absolute",
                  left: 58,
                  top: 58
                }
              }),
              UINode.if(this.showShovelRequirement, View({ //ShovelTag
                children: [Image({ //icn_shovelBG
                  source: ImageSource.fromTextureAsset(this.props.icn_shovelBG!),

                  style: {
                    width: 184,
                    height: 184,
                    flexShrink: 0,
                    position: "absolute",
                    tintColor: this.rarityTint,
                    left: 0,
                    top: 0
                  }
                }),
                Image({ //icn_shovel
                  source: this.shovelImage,
                  style: {
                    width: 200,
                    height: 200,
                    transform: [
                      {
                        rotate: "30deg"
                      }
                    ],
                    flexShrink: 0,
                    position: "absolute",
                    alignSelf: "center",
                    bottom: 12,
                    right: 16

                  }
                })],
                style: {
                  width: 200,
                  height: 200,
                  flexShrink: 0,
                  position: "absolute",
                  left: 216,
                  top: 216
                }
              }))],
              style: {
                height: 416,
                alignSelf: "stretch",
                marginTop: -28
              }
            }),
            Image({ //icn_triangleD
              source: ImageSource.fromTextureAsset(this.props.icn_triangleD!),

              style: {
                width: 164,
                height: 164,
                marginTop: -84,
                tintColor: "#FFF9E7",
                transform: [
                  {
                    rotate: "180deg"
                  }
                ],

              }
            }),
          ],
          style: {
            display: "flex",
            width: 416,
            flexDirection: "column",
            alignItems: "center",
            position: "absolute",
            left: 856,
            top: 124
          }
        }),
        UINode.if(this.showBubble, View({ //BubbleGroup
          children: [View({ //BubbleSml
            style: {
              width: 84,
              height: 84,
              flexShrink: 0,
              borderRadius: 208,
              borderWidth: 16,
              borderColor: "#FFF",
              backgroundColor: "#FFF9E7",
              position: "absolute",
              left: 0,
              top: 332,
              opacity: this.bubbleSmlOpacity,
            }
          }),
          View({ //BubbleBig
            style: {
              width: 116,
              height: 116,
              flexShrink: 0,
              borderRadius: 208,
              borderWidth: 16,
              borderColor: "#FFF",
              backgroundColor: "#FFF9E7",
              position: "absolute",
              left: 100,
              top: 288,
              opacity: this.bubbleLrgOpacity,
            }
          }),
          Image({ //icn_bubble
            source: ImageSource.fromTextureAsset(this.props.icn_bubble!),

            style: {
              width: 583,
              height: 496,
              justifyContent: "center",
              alignItems: "center",
              flexShrink: 0,
              position: "absolute",
              left: 216,
              top: 0,
              opacity: this.bubbleFinalOpacity,
            }
          }),
          View({ //TextGroup
            children: [
              UINode.if(this.useStarRequirement, View({ //Star Group
                children: [Text({ // Number Text
                  text: this.starRequirement,
                  style: {
                    color: this.bubbleTextTint, // Tint red #F02849, green #31A24C
                    textAlign: "center",
                    fontFamily: "Roboto",
                    fontSize: 112,
                    fontWeight: "900"
                  }
                }),
                Image({ //icn_star
                  source: ImageSource.fromTextureAsset(this.props.icn_star!),

                  style: {
                    width: 128,
                    height: 128,
                    tintColor: this.bubbleTextTint // Tint red #F02849, green #31A24C
                  }
                })],
                style: {
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  flexDirection: "row"
                }
              })),
              Text({ // Text
                text: this.bubbleText, // Or "Chance is up! Try again!", tint green
                style: {
                  width: 544,
                  color: this.bubbleTextTint, // Tint red #F02849, green #31A24C
                  textAlign: "center",
                  fontFamily: "Roboto",
                  fontSize: 70,
                  fontWeight: "900"
                }
              })],
            style: {
              display: "flex",
              width: 584,
              height: 496,
              paddingVertical: 108,
              paddingHorizontal: 20,
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              flexShrink: 0,
              borderRadius: 42,
              position: "absolute",
              left: 216,
              top: 0,
              opacity: this.bubbleFinalOpacity,
            }
          })],
          style: {
            width: 800,
            height: 496,
            flexShrink: 0,
            position: "absolute",
            left: 1328,
            top: 0
          }
        }))
      ],
      style: {
        width: 2128,
        height: 700,
        position: "relative",
        opacity: this.hudElementVisible.interpolate([0, 1]),
      }
    })
    return UINode.if(this.show, root);
  }
}
UIComponent.register(DigSpotUI);
