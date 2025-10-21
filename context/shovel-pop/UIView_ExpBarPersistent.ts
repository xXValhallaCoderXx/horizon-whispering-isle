/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ExpEvents } from 'BigBox_ExpEvents';
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { Player } from 'horizon/core';
import * as ui from 'horizon/ui';
import { Image, ImageSource, Text, View } from 'horizon/ui';
import { HUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';

const CURRENCY_INTERPOLATE_DURATION = .8;
const CURRENCY_INTERPOLATE_NUM_STEPS = 6;
const CURRENCY_INTERPOLATE_UPDATE_DELAY = CURRENCY_INTERPOLATE_DURATION / CURRENCY_INTERPOLATE_NUM_STEPS;
const PULSE_DURATION = 150;
const PULSE_MAX_SCALE = 1.5;

const DIALOG_PURCHASE_OPEN_DURATION = 200;

export class UIView_ExpBarPersistent extends UIView_InteractionNonBlockingBase {

  private progressBarPercent!: ui.AnimatedBinding;
  private gemScale!: ui.AnimatedBinding;
  private expScale!: ui.AnimatedBinding;
  private currencyScale!: ui.AnimatedBinding;
  private currentLevel!: ui.Binding<string>;
  private currency!: ui.Binding<string>;
  private gems!: ui.Binding<string>;
  private hudElementVisible!: HUDElementVisibilityTracker;
  private canUpgradeAny = new ui.Binding(false);
  private purchaseDialogLocation = new ui.AnimatedBinding(0); // 0 (normal) to 1 (purchase dialog)

  private currencyDisplayValue = 0;
  private targetCurrencyValue = 0;
  private currencyInterpolateStep = 0;
  private currencyUpdateDelay = 0;
  private gemsValue = 0;
  private currentLevelValue = 0;
  private percentExpToNextLevelValue = 0;

  private onUpdateCallback: hz.EventSubscription | undefined;

  rootPanelStyle: ui.ViewStyle = {
    width: "20%",
    height: "50%",
    position: "absolute",
    justifyContent: "flex-start", // Align vertical to the bottom
    alignContent: "center",
    alignSelf: "flex-start", // alight to left of screen
    alignItems: "flex-start", // Align horizontal to the middle
    marginLeft: "7%", // Add space on the left side
    marginTop: "20%", // Add space on the top side
  }

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);

    const serverPlayer = this.uiRoot.world.getServerPlayer();
    const localPlayer = this.uiRoot.world.getLocalPlayer();

    this.progressBarPercent = new ui.AnimatedBinding(0);
    this.currentLevel = new ui.Binding("1");
    this.currency = new ui.Binding("0");
    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.Resources);
    this.gems = new ui.Binding("0");
    this.gemScale = new ui.AnimatedBinding(1);
    this.expScale = new ui.AnimatedBinding(1);
    this.currencyScale = new ui.AnimatedBinding(1);

    this.uiRoot.connectNetworkBroadcastEvent(BigBox_ExpEvents.expUpdatedForPlayer, this.OnExpUpdatedForPlayer.bind(this));
    this.uiRoot.connectNetworkBroadcastEvent(BigBox_Player_Inventory.onCurrencyChanged, this.onCurrencyChanged.bind(this))
    this.uiRoot.connectNetworkBroadcastEvent(BigBox_Player_Inventory.onInitializeCurrency, (data) => this.onInitializeCurrency(data.player, data.initialAmount))
    this.uiRoot.sendNetworkBroadcastEvent(BigBox_ExpEvents.requestInitializeExpForPlayer, { player: localPlayer }, [serverPlayer]);
    this.uiRoot.sendNetworkBroadcastEvent(BigBox_Player_Inventory.onRequestCurrencyForInitialization, { player: localPlayer }, [serverPlayer]);
    this.uiRoot.connectLocalBroadcastEvent(Events.updateGemUI, () => this.updateGemUI());
    this.uiRoot.connectLocalBroadcastEvent(Events.updateExpUI, () => this.updateExpUI());
    this.uiRoot.connectLocalBroadcastEvent(Events.updateCurrencyUI, () => this.pulse(this.currencyScale))
    this.uiRoot.connectNetworkBroadcastEvent(PlayerDataEvents.gemsUpdated, (data) => this.onGemsUpdated(data.player, data.gems, data.updateHUD));
    this.uiRoot.connectLocalBroadcastEvent(Events.canUpgradeAnyShovelUpdated, payload => this.canUpgradeAny.set(payload.canUpgradeAny, [this.localPlayer]));
    this.uiRoot.connectLocalBroadcastEvent(Events.dialogPurchaseOpen, (data) => {
      this.purchaseDialogLocation.set(ui.Animation.timing(data.open ? 1 : 0, { duration: DIALOG_PURCHASE_OPEN_DURATION, easing: ui.Easing.linear }), undefined, [this.localPlayer]);
    })
    this.hudElementVisible.connect(this.uiRoot);
  }

  private onGemsUpdated(player: hz.Player, gems: number, updateHUD: boolean): void {
    this.gemsValue = gems;
    if (!updateHUD) {
      return;
    }
    this.updateGemUI();
  }

  private OnExpUpdatedForPlayer(data: { player: Player, currentLevel: number, percentExpToNextLevel: number, gainedExp: number, showToast: boolean, updateUI?: boolean }) {
    if (this.localPlayer !== data.player) {
      return;
    }

    this.currentLevelValue = data.currentLevel;
    this.percentExpToNextLevelValue = data.percentExpToNextLevel;
    if (data.updateUI ?? true) {
      this.updateExpUI();
    }
  }

  private updateGemUI() {
    this.gems.set(this.gemsValue.toString(), [this.localPlayer]);
    this.pulse(this.gemScale);
  }

  private updateExpUI() {
    this.progressBarPercent.set(x => {
      if (x > this.percentExpToNextLevelValue) {
        return 0;
      }
      else {
        return x;
      }
    }, undefined, [this.uiRoot.world.getLocalPlayer()]);
    this.progressBarPercent.set(ui.Animation.timing(this.percentExpToNextLevelValue, { duration: 100, easing: ui.Easing.inOut(ui.Easing.linear) }), undefined, [this.localPlayer]);
    this.currentLevel.set(this.currentLevelValue.toString(), [this.localPlayer]);
    this.pulse(this.expScale);
  }

  private pulse(scaleBinding: ui.AnimatedBinding) {
    scaleBinding.set(ui.Animation.sequence(
      ui.Animation.timing(PULSE_MAX_SCALE, { duration: PULSE_DURATION, easing: ui.Easing.linear }),
      ui.Animation.timing(1, { duration: PULSE_DURATION, easing: ui.Easing.linear })
    ), undefined, [this.localPlayer]);
  }

  private update(deltaTime: number) {
    this.currencyInterpolateUpdate(deltaTime);
  }

  private currencyInterpolateUpdate(deltaTime: number) {
    if (this.targetCurrencyValue <= this.currencyDisplayValue) {
      this.onUpdateCallback?.disconnect();
      this.onUpdateCallback = undefined;
      return;
    }
    this.currencyUpdateDelay -= deltaTime;
    while (this.currencyUpdateDelay <= 0) {
      this.setCurrencyDisplayValue(Math.min(this.currencyDisplayValue + this.currencyInterpolateStep, this.targetCurrencyValue));
      if (this.currencyDisplayValue >= this.targetCurrencyValue) {
        this.onUpdateCallback?.disconnect();
        this.onUpdateCallback = undefined;
        return;
      }
      this.currencyUpdateDelay += CURRENCY_INTERPOLATE_UPDATE_DELAY;
    }
  }

  private onCurrencyChanged(data: { player: Player, newAmount: number }) {
    this.setCurrency(data.player, data.newAmount, true);
  }

  private onInitializeCurrency(player: Player, newAmount: number) {
    this.setCurrency(player, newAmount, false);
  }

  private setCurrency(player: Player, newAmount: number, useEffects: boolean) {
    if (this.uiRoot.world.getLocalPlayer() === player) {
      if (newAmount > this.targetCurrencyValue && useEffects) {
        this.currencyInterpolateStep = Math.ceil((newAmount - this.currencyDisplayValue) / CURRENCY_INTERPOLATE_NUM_STEPS);
        this.currencyUpdateDelay = CURRENCY_INTERPOLATE_UPDATE_DELAY;
        this.onUpdateCallback?.disconnect();
        this.onUpdateCallback = this.uiRoot.connectLocalBroadcastEvent(hz.World.onUpdate, payload => this.update(payload.deltaTime));
      } else {
        this.setCurrencyDisplayValue(newAmount);
      }
      this.targetCurrencyValue = newAmount;
    }
  }

  setCurrencyDisplayValue(value: number) {
    this.currencyDisplayValue = value;
    this.currency.set('$' + UI_Utils.simplifyNumberToText(value, true), [this.localPlayer]);
  }

  private onGemClicked() {
    this.uiRoot.sendLocalBroadcastEvent(ShovelProgressionEvents.requestToggleShovelInventory, {});
  }

  createView() {
    const root = View({ //UIHUDLvlMoney
      children: [
        View({ //Level Bar Widget
          children: [
            View({ //Progress Bar BG
              children: [View({ //Fill
                children: [],
                style: {
                  width: this.progressBarPercent.interpolate([0, 1], ["0%", "100%"]),
                  height: 22.3,
                  borderBottomRightRadius: 11.1,
                  borderTopRightRadius: 11.1,
                  borderBottomLeftRadius: 0,
                  borderTopLeftRadius: 0,
                  backgroundColor: "#61CDB9",
                  position: "relative",
                  //left: 0,
                  //top: 0
                }
              })],
              style: {
                display: "flex",
                height: 28,
                padding: 0,
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "center",
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                borderBottomRightRadius: 14,
                borderTopRightRadius: 14,
                borderBottomLeftRadius: 0,
                borderTopLeftRadius: 0,
                borderWidth: 3,
                borderColor: "#DCF4DB",
                backgroundColor: "#00343E"
              }
            }),

            View({ //Spacer
              style: {
                width: 12,
                height: 28,
                marginLeft: -16,
                backgroundColor: "#DCF4DB"
              }
            }),
            View({ //Level Widget
              children: [
                View({ //BG Group
                  children: [
                    Image({ //icn_lvlBGL
                      source: ImageSource.fromTextureAsset(this.props.icn_lvlBGL!),
                      style: {
                        width: 32,
                        alignSelf: "stretch"
                      }
                    }),
                    Image({ //icn_lvlBGC
                      source: ImageSource.fromTextureAsset(this.props.icn_lvlBGC!),
                      style: {
                        flexGrow: 1,
                        flexShrink: 0,
                        flexBasis: 0,
                        alignSelf: "stretch",
                        marginLeft: -1
                      }
                    }),
                    Image({ //icn_lvlBGR
                      source: ImageSource.fromTextureAsset(this.props.icn_lvlBGR!),
                      style: {
                        width: 32,
                        alignSelf: "stretch",
                        marginLeft: -1
                      }
                    })],
                  style: {
                    display: "flex",
                    height: 32,
                    alignItems: "flex-start",
                    alignSelf: "stretch",
                    flexDirection: "row"
                  }
                }),
                View({ //Text Group
                  children: [Text({ // Lv.
                    text: "Lv.",
                    style: {
                      display: "flex",
                      width: 20,
                      height: 28,
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      color: "#00343E",
                      fontSize: 16,
                      fontWeight: "700",
                      textAlign: "right",
                      textAlignVertical: "center"
                    }
                  }),
                  View({ //Spacer
                    style: {
                      width: 4,
                      height: 32
                    }
                  }),
                  Text({ // Level Number
                    text: this.currentLevel,
                    style: {
                      color: "#00343E",
                      fontSize: 24,
                      fontWeight: "700",
                      textAlign: "left"
                    }
                  })],
                  style: {
                    display: "flex",
                    paddingVertical: 0,
                    paddingHorizontal: 16,
                    alignItems: "flex-end",
                    flexDirection: "row",
                    marginTop: -32,
                    transform: [{ scale: this.expScale }]
                  }
                })],
              style: {
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center"
              }
            })],
          style: {
            display: "flex",
            width: 150,
            justifyContent: "center",
            alignItems: "flex-end",
            flexDirection: "row-reverse"
          }
        }),
        View({ //Money Widget
          children: [
            View({ //BG
              style: {
                width: 150,
                height: 28,
                position: "absolute",
                borderRadius: 12,
                borderWidth: 3,
                borderColor: "#FAECD3",
                backgroundColor: "#F9D470",
                left: 0,
                top: 0
              }
            }),
            View({ //Spacer
              style: {
                width: 28,
                height: 28,
                flexShrink: 0
              }
            }),
            Text({ // Money Text
              text: this.currency,
              style: {
                display: "flex",
                alignSelf: "stretch",
                flexDirection: "column",
                justifyContent: "center",
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                color: "#5A3715",
                textAlign: "right",
                fontFamily: "Roboto",
                fontSize: 18,
                textAlignVertical: "center",
                fontWeight: "900",
                transform: [{ scale: this.currencyScale }]
              }
            }),
            Image({ //icn_money
              source: ImageSource.fromTextureAsset(this.props.icn_money!),
              style: {
                width: 40,
                height: 40,
                position: "absolute",
                left: 8,
                top: -8,
                resizeMode: "cover",
                transform: [{ scale: this.currencyScale }]
              }
            })],
          style: {
            display: "flex",
            width: 150,
            height: 28,
            paddingVertical: 0,
            paddingHorizontal: 12,
            alignItems: "center",
            flexDirection: "row",
            marginTop: 8
          }
        }),
        View({ //Gem Widget
          children: [
            View({//Gem Widget
              children: [
                View({ //BG
                  style: {
                    width: 150,
                    height: 28,
                    position: "absolute",
                    borderRadius: 12,
                    borderWidth: 3,
                    borderColor: "#FFDDFF",
                    backgroundColor: "#ffc8ff",
                    left: 0,
                    top: 0
                  }
                }),
                View({ //Spacer
                  style: {
                    width: 48,
                    height: 28,
                    flexShrink: 0
                  }
                }),
                Text({ // GemText
                  text: this.gems,
                  style: {
                    display: "flex",
                    height: 28,
                    flexDirection: "column",
                    justifyContent: "center",
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0,
                    color: "#660066",
                    textAlign: "right",
                    textAlignVertical: "center",
                    fontFamily: "Roboto",
                    fontSize: 18,
                    fontWeight: "900",
                    transform: [{ scale: this.gemScale }]
                  }
                }),
                Image({ //icn_gem
                  source: ImageSource.fromTextureAsset(this.props.icn_gem!),
                  style: {
                    width: 32,
                    height: 32,
                    position: "absolute",
                    left: 8,
                    top: -4,
                    resizeMode: "cover",
                    transform: [{ scale: this.gemScale }]
                  }
                }),
                // UINode.if(this.canUpgradeAny, View({
                //   children: [
                //     Image({ //icn_notification
                //       source: ImageSource.fromTextureAsset(this.props.timedReward_notificationIcon!),
                //       style: {
                //         width: 20,
                //         height: 20,
                //       }
                //     }),
                //   ],
                //   style: {
                //     position: "absolute",
                //     top: -3,
                //     right: -3,
                //     zIndex: 1,
                //   }
                // })),
              ],
              style: {
                display: "flex",
                width: 150,
                height: 28,
                paddingVertical: 0,
                paddingHorizontal: 16,
                alignItems: "center",
                flexDirection: "row"
              },
            })
          ],
          style: {
            display: "flex",
            width: 150,
            height: 28,
            alignItems: "flex-end",
            flexDirection: "row",
            marginTop: 8
          },
          //onClick: () => this.onGemClicked(),
        }),

      ],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        paddingLeft: 100,
        paddingBottom: 60,
        bottom: 0, //this.purchaseDialogLocation.interpolate([0,1], ["17%","10%"]),
        left: 0,//this.purchaseDialogLocation.interpolate([0,1],["-11%","0%"]),
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        flexShrink: 0,
        position: "absolute"
      }
    });

    return ui.UINode.if(this.hudElementVisible.isVisible(), root);
  }
}
