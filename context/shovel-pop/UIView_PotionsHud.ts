/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { GameConstants } from 'Constants';
import { DigMinigame, LuckSource } from 'DigMinigame';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import { AnimatedBinding, Animation, Binding, ColorValue, Easing, Image, ImageSource, Pressable, Text, UINode, View } from 'horizon/ui';
import { HUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { Logger } from 'Logger';
import { SelectedPotionData } from 'PlayerData';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { PotionInventoryData } from 'PlayerInventoryData';
import { PotionData } from 'PotionData';
import { missing_texture, UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlocking2Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking2 } from 'UIRoot_InteractionNonBlocking2';
import { UIView_PotionInventory } from 'UIView_PotionInventory';

const MAX_VISIBLE_POTIONS = 3;

const log = new Logger("UIView_PotionsHud");

export class UIView_PotionsHud extends UIView_InteractionNonBlocking2Base {
  private hudElementVisible!: HUDElementVisibilityTracker;

  constructor(uiRoot: UIRoot_InteractionNonBlocking2) {
    super(uiRoot);
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.DigMinigameUsefulWidget);
    this.hudElementVisible.connect(this.uiRoot);

    const missingTexture = missing_texture.getImage();
    for (let i = 0; i < MAX_VISIBLE_POTIONS; i++) {
      this.activePotionViewModels.push(new ActivePotionViewModel(missingTexture));
    }

    this.uiRoot.connectNetworkBroadcastEvent(UIView_PotionInventory.potionInventoryUpdated, data => this.onPotionInventoryUpdated(data.potionInventory));

    this.uiRoot.connectNetworkBroadcastEvent(PlayerDataEvents.updateSelectedPotions, (data) => this.updateSelectedPotions(data.selectedPotionsData));
    this.uiRoot.sendNetworkBroadcastEvent(PlayerDataEvents.requestSelectedPotions, { player: this.localPlayer }, [this.serverPlayer]);

    this.uiRoot.connectLocalBroadcastEvent(Events.showHasNewPotions, (payload) => {
      let target = [this.localPlayer];
      if (this.newPotionCountCache === 0) {
        this.hasNewPotions.set(true, target);
      }

      this.newPotionCountCache = Math.min(99, this.newPotionCountCache + payload.count)
      this.newPotionCount.set(`${this.newPotionCountCache}`, target);
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.usePotionsForMinigame, data => this.onUsePotionsForMinigame(data.flyToBottom));
  }

  activePotionViewModels: ActivePotionViewModel[] = [];
  hasActivePotions = new Binding<boolean>(false);
  hasNoActivePotions = new Binding<boolean>(true);
  hasNewPotions = new Binding<boolean>(false);
  newPotionCount = new Binding<string>('5');
  activePotionMoreCount = new Binding<string>("");
  headerText = new Binding<string>("No Active Potion");
  headerBgColor = new Binding<ColorValue>("#FF5252");
  headerTextColor = new Binding<ColorValue>("#FFFFFF");
  optionDigCountOpacity = new AnimatedBinding(1);

  newPotionCountCache = 0;
  hasActivePotionsCache = false;
  activePotionCount = 0;

  potionInventory: PotionInventoryData[] = [];
  selectedPotionIds: string[] = [];

  setHasActivePotions(hasActivePotions: boolean) {
    if (this.hasActivePotionsCache != hasActivePotions) {
      let target = [this.localPlayer];
      this.hasActivePotionsCache = hasActivePotions;

      this.hasActivePotions.set(hasActivePotions, target);
      this.hasNoActivePotions.set(!hasActivePotions, target);
      this.headerText.set(hasActivePotions ? "Active Potion" : "No Active Potion", target)
      this.headerBgColor.set(hasActivePotions ? "#A9BAF4" : "#FF5252", target);
      this.headerTextColor.set(hasActivePotions ? "#2A325C" : "#FFFFFF", target);
    }
  }

  onClicked() {
    let target = [this.localPlayer];
    this.uiRoot.sendLocalBroadcastEvent(UIView_PotionInventory.requestTogglePotionInventory, {});
    this.hasNewPotions.set(false, target);
    this.newPotionCountCache = 0;
    this.newPotionCount.set(`${this.newPotionCountCache}`, target);
  }

  private onPotionInventoryUpdated(potionInventory: PotionInventoryData[]) {
    this.potionInventory = potionInventory;
    this.updatePotionView();
  }

  private updateSelectedPotions(selectedPotions: SelectedPotionData[]) {
    this.selectedPotionIds = selectedPotions.map((selectedPotion) => selectedPotion.id);
    this.updatePotionView();
  }

  private updatePotionView() {
    this.setHasActivePotions(this.selectedPotionIds.length > 0);
    this.activePotionCount = this.selectedPotionIds.length;

    for (let i = 0; i < this.activePotionViewModels.length; i++) {
      let activePotionViewModel = this.activePotionViewModels[i];
      if (this.selectedPotionIds[i] !== undefined) {
        activePotionViewModel.isActive.set(true, [this.localPlayer]);
        activePotionViewModel.x1Scale.set(0, undefined, [this.localPlayer]);
        activePotionViewModel.image.set(PotionData.getPotionImage(this.selectedPotionIds[i])!, [this.localPlayer]);
        const potionInInventory = this.potionInventory.find(potion => potion.id === this.selectedPotionIds[i]);
        if (potionInInventory) {
          activePotionViewModel.digs.set(potionInInventory ? `${potionInInventory.count}` : `0`, [this.localPlayer]);
        }
      }
      else {
        activePotionViewModel.isActive.set(false, [this.localPlayer]);
      }
    }

    if (this.selectedPotionIds.length > this.activePotionViewModels.length) {
      this.activePotionMoreCount.set(`+${this.selectedPotionIds.length - this.activePotionViewModels.length}`, [this.localPlayer]);
    }
    else {
      this.activePotionMoreCount.set("", [this.localPlayer]);
    }
  }

  private onUsePotionsForMinigame(flyToBottom: boolean) {
    log.info(`onUsePotionsForMinigame flyToBottom: ${flyToBottom}`)
    this.optionDigCountOpacity.set(Animation.timing(0, { duration: 100, easing: Easing.linear }), undefined, [this.localPlayer]);
    let delay = 0;
    let x = -500;
    const centerY = 50;
    const bottomY = 380;
    const bottomScale = 1;
    const centerScale = 4;
    const centerFadeAwayScale = 6;
    const centerFadeAwayDuration = 250;
    const flyToCenterDuration = 250;
    const flyToBottomDuration = 250;
    const x1ScaleDuration = 300;
    const centerDelay = 400;
    const fadeDuration = 100;
    for (let i = 0; i < this.activePotionCount; i++) {
      const potionId = this.selectedPotionIds[i];
      const chanceBoost = PotionData.getPotionMinigameChanceBoost(potionId);
      x += -10;
      if (chanceBoost <= 0) {
        continue;
      }
      const viewModel = this.activePotionViewModels[i];
      this.uiRoot.async.setTimeout(() => {
        viewModel.scale.set(Animation.timing(centerScale, { duration: flyToCenterDuration, easing: Easing.inOut(Easing.cubic) }), undefined, [this.localPlayer]);
        viewModel.translateY.set(Animation.timing(centerY, { duration: flyToCenterDuration, easing: Easing.inOut(Easing.cubic) }), undefined, [this.localPlayer]);
        viewModel.translateX.set(Animation.timing(x, { duration: flyToCenterDuration, easing: Easing.inOut(Easing.cubic) }), undefined, [this.localPlayer]);
        viewModel.x1Scale.set(Animation.timing(1, { duration: flyToCenterDuration, easing: Easing.linear }), undefined, [this.localPlayer]);
      }, delay);
      // this.uiRoot.async.setTimeout(() => {
      // }, delay + flyToCenterDuration);
      if (flyToBottom) {
        this.uiRoot.async.setTimeout(() => {
          viewModel.scale.set(Animation.timing(bottomScale, { duration: flyToBottomDuration, easing: Easing.linear }), undefined, [this.localPlayer]);
          viewModel.translateY.set(Animation.timing(bottomY, { duration: flyToBottomDuration, easing: Easing.linear }), undefined, [this.localPlayer]);
        }, delay + flyToCenterDuration + centerDelay);
        this.uiRoot.async.setTimeout(() => {
          viewModel.opacity.set(Animation.timing(0, { duration: fadeDuration, easing: Easing.linear }), undefined, [this.localPlayer])
        }, delay + flyToCenterDuration + centerDelay + flyToBottomDuration - fadeDuration);
        this.uiRoot.async.setTimeout(() => {
          this.uiRoot.sendLocalBroadcastEvent(DigMinigame.bumpLuck, { amount: chanceBoost, source: LuckSource.Potion });
        }, delay + flyToCenterDuration + centerDelay + flyToBottomDuration);
      } else {
        this.uiRoot.async.setTimeout(() => {
          viewModel.scale.set(Animation.timing(centerFadeAwayScale, { duration: centerFadeAwayDuration, easing: Easing.linear }), undefined, [this.localPlayer]);
          viewModel.opacity.set(Animation.timing(0, { duration: centerFadeAwayDuration, easing: Easing.linear }), undefined, [this.localPlayer])
        }, delay + flyToCenterDuration + centerDelay);
      }
      delay += GameConstants.Minigame.PotionActivationDelay;
    }
    delay += 2000;
    this.uiRoot.async.setTimeout(() => {
      this.optionDigCountOpacity.set(1, undefined, [this.localPlayer]);
      this.activePotionViewModels.forEach((activePotionViewModel) => {
        activePotionViewModel.x1Scale.set(0, undefined, [this.localPlayer]);
        activePotionViewModel.opacity.set(1, undefined, [this.localPlayer]);
        activePotionViewModel.scale.set(1, undefined, [this.localPlayer]);
        activePotionViewModel.translateX.set(0, undefined, [this.localPlayer]);
        activePotionViewModel.translateY.set(0, undefined, [this.localPlayer]);
      });
    }, delay);
  }

  activePotionList() {
    let activePotionChildren = this.activePotionViewModels.map((activePotionViewModel) =>
      this.activePotion(activePotionViewModel)
    );

    activePotionChildren.push(this.activePotionMore());

    return View({ //Potion List
      children: activePotionChildren,
      style: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: 0,
        flexDirection: "row"
      }
    })
  }

  activePotionMore() {
    return View({ //Active Potion More
      children: [UI_Utils.outlinedText({ // +2
        text: this.activePotionMoreCount,
        outlineSize: 2,
        style: {
          color: "#FFF",
          textAlign: "center",
          fontFamily: "Roboto",
          fontSize: 16,
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        height: 56,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 8,
        marginLeft: 2
      }
    })
  }

  activePotion(activePotionViewModel: ActivePotionViewModel) {
    return UINode.if(activePotionViewModel.isActive,
      View({ //Active Potion Cell
        children: [Image({ //icn_potion
          source: activePotionViewModel.image,
          style: {
            width: 34,
            height: 32,
            flexShrink: 0,
            resizeMode: "cover"
          }
        }),
        View({ //Stat Group
          children: [UI_Utils.outlinedText({ // 10
            text: activePotionViewModel.digs,
            outlineSize: 2,
            style: {
              color: "#FFF",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 12,
              fontWeight: "700"
            }
          }),
          Image({ //icn_smallShovel
            source: ImageSource.fromTextureAsset(this.props.icn_smallShovel!),
            style: {
              width: 16,
              height: 16,
              resizeMode: "cover",
              marginLeft: 2
            }
          }),
          ],
          style: {
            display: "flex",
            height: 16,
            marginTop: -16,
            paddingVertical: 0,
            paddingHorizontal: 4,
            alignItems: "center",
            flexShrink: 0,
            borderRadius: 4,
            flexDirection: "row",
            opacity: this.optionDigCountOpacity
          }
        }),
        UI_Utils.outlinedText({
          text: "x1",
          outlineSize: 1,
          style: {
            fontFamily: "Roboto",
            fontSize: 16,
            width: 30,
            height: 30,
            fontWeight: "bold",
            opacity: activePotionViewModel.x1Scale.interpolate([0, .1, 1], [0, 1, 1]),
            position: "absolute",
            transform: [{ translate: [26, -25] }]
          }
        })],
        style: {
          display: "flex",
          height: 32,
          marginTop: -2,
          flexDirection: "column",
          alignItems: "center",
          borderRadius: 4,
          opacity: activePotionViewModel.opacity,
          transform: [
            { translateX: activePotionViewModel.translateX },
            { translateY: activePotionViewModel.translateY },
            { scale: activePotionViewModel.scale },
          ]
        }
      }))
  }

  createView() {
    const root = View({ //UIHUDPotionWidget
      children: [
        View({ //HUD Potion Widget
          children: [
            View({ //Panel
              children: [
                Pressable({ //BG
                  children: [],
                  style: {
                    height: 44,
                    alignSelf: "stretch",
                    borderTopLeftRadius: 12,
                    borderTopRightRadius: 22,
                    borderBottomRightRadius: 22,
                    borderBottomLeftRadius: 12,
                    borderBottomWidth: 4,
                    backgroundColor: "#EAECFF",
                    borderColor: "#ADA5FC"
                  },
                  onClick: () => this.onClicked(),
                  disabled: this.hudElementVisible.disableInput()
                }),
                View({ //Content
                  children: [
                    UINode.if(this.hasNoActivePotions,
                      View({ //EmptyTextGroup - only show when there's no active potion
                        children: [Text({ // Use a potion text
                          text: "No Active Potion",
                          style: {
                            color: "#A4A9AE",
                            width: 70,
                            textAlign: "center",
                            textAlignVertical: "center",
                            fontFamily: "Roboto",
                            fontSize: 14,
                            fontWeight: "700"
                          }
                        })],
                        style: {
                          display: "flex",
                          alignItems: "center",
                          flexGrow: 1,
                          paddingRight: 8,
                          flexShrink: 0,
                          flexBasis: 0,
                          flexDirection: "row"
                        }
                      })),
                    UINode.if(this.hasActivePotions,
                      this.activePotionList()),
                  ],
                  style: {
                    display: "flex",
                    height: 44,
                    paddingTop: 0,
                    paddingRight: 48,
                    paddingBottom: 4,
                    paddingLeft: 12,
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    marginTop: -44
                  }
                }),

              ],
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                borderRadius: 12
              }
            }),
            Image({ //icn_potionHUD
              source: ImageSource.fromTextureAsset(this.props.icn_potionHUD!),
              style: {
                width: 70,
                height: 70,
                flexShrink: 0,
                resizeMode: "cover",
                position: "absolute",
                right: 2
              }
            }),

            UINode.if(this.hasNewPotions, UI_Utils.makeNewBadge(this.newPotionCount, 5, 0)),

            /*UINode.if(this.hasNewPotions, View({ //Pip
                children: [
                  UI_Utils.outlinedText({ // 1
                    text: this.newPotionCount,
                    outlineSize: 1,
                    style: {
                      top: 1,
                      alignSelf: "center",
                      fontSize: 17,
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontFamily: "Roboto",
                      fontWeight: "bold",
                    }
                  })],
                style: {
                  backgroundColor: "red",
                  borderRadius: 12,
                  borderColor: "red",
                  width: 24,
                  height: 24,
                  position: "absolute",
                  right: 0,
                  top: 8
                }
              }))*/
          ],
          style: {
            display: "flex",
            height: 60,
            justifyContent: "flex-end",
            paddingRight: 12,
            alignItems: "flex-end",
            flexDirection: "row",
            position: "absolute",
            // right: 165,
            // top: 83,
          },
          //onClick: () => this.onClicked(),
        })],
      style: {
        position: 'absolute',
        height: '14%',
        width: '12%',
        right: 167,
        top: 57,
        alignContent: 'flex-end',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
      }
    })

    return UINode.if(this.hudElementVisible.isVisible(), root);
  }
}

class ActivePotionViewModel {
  image: Binding<ImageSource>;
  digs = new Binding<string>("");
  isActive = new Binding<boolean>(false);
  translateX = new AnimatedBinding(0);
  translateY = new AnimatedBinding(0);
  scale = new AnimatedBinding(1);
  opacity = new AnimatedBinding(1);
  x1Scale = new AnimatedBinding(1);

  constructor(imageSource: ImageSource) {
    this.image = new Binding(imageSource);
  }
}
