/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType } from 'Enums';
import { Timer } from 'GameUtils';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { HUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { Logger } from 'Logger';
import { PlayerEffects } from 'PlayerEffectsController';
import { ActiveQuestData, PlayerQuests, QuestEvents, SubquestState } from 'QuestManager';
import { UI_QuestCompleteHud } from 'UI_QuestCompleteHud';
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';

const log = new Logger("UIView_Quest");

const MAX_SUBQUEST_COUNT = 3;
const ANIMATION_DURATION = 0.3 * 1000;
const PAUSE_DURATION = 200;

export class UIView_Quest extends UIView_InteractionNonBlockingBase {
  private waitingOnQuestComplete = false;
  private hudElementVisible!: HUDElementVisibilityTracker;

  private playerQuests!: PlayerQuests;

  private gemVisible = new Binding(false);


  constructor(uiRoot : UIRoot_InteractionNonBlocking) {
    super(uiRoot);

    this.hudElementVisible = new HUDElementVisibilityTracker(HUDElementType.Quest);
    this.hudElementVisible.connect(this.uiRoot);

    for (let i = 0; i < MAX_SUBQUEST_COUNT; i++) {
      this.subquestViewModels.push(new SubquestViewModel());
    }

    this.uiRoot.connectNetworkBroadcastEvent(QuestEvents.startQuestForPlayer, (data) =>{
      if (data.player === this.localPlayer) {
        this.playerQuests = data.playerQuests;
        this.onStartQuestForPlayer(this.playerQuests.activeQuests[this.playerQuests.currentQuestIndex]);
      }
    });

    this.uiRoot.connectNetworkBroadcastEvent(QuestEvents.playerQuestsChangedForPlayer, (data) => {
      if (data.player === this.localPlayer) {
        this.playerQuests = data.playerQuests;
        this.updateWithCurrentQuest();
      }
    });

    this.uiRoot.connectNetworkBroadcastEvent(QuestEvents.finishQuestForPlayer, (data) => {
      if (data.player === this.localPlayer) {
        let currentActiveQuest = this.playerQuests.activeQuests[this.playerQuests.currentQuestIndex];
        let completedCurrentQuest = data.questId === currentActiveQuest.questId;
        this.playerQuests = data.playerQuests;
        this.onFinishQuestForPlayer(completedCurrentQuest);
      }
    });

    this.uiRoot.sendNetworkBroadcastEvent(QuestEvents.initializeUIQuestsForPlayer, { player: this.localPlayer }, [this.uiRoot.world.getServerPlayer()]);
  }

  onStartQuestForPlayer(activeQuest: ActiveQuestData) {
    if (this.waitingOnQuestComplete) {
      this.uiRoot.async.setTimeout(() => this.onStartQuestForPlayer(activeQuest), ANIMATION_DURATION);
      // wait on showing this new quest until the quest complete effect is finished
      return;
    }

    this.updateQuestState(activeQuest);

    let target = [this.localPlayer];
    this.questHorizonalPos.set(0, target);

    this.newQuestOpacity.set(1, undefined, target);
    this.newQuestOpacity.set(
      Animation.delay(ANIMATION_DURATION + PAUSE_DURATION * 5, // delay until after the slide in animation + some buffer
      Animation.timing(0, {
        duration: 400,
        easing: Easing.linear
    })), undefined, target);

    log.info("Quest started for ui")
  }

  onFinishQuestForPlayer(completedCurrentQuest: boolean) {
    this.playQuestCompleteEffect();

      this.uiRoot.async.setTimeout(() => {
        if (completedCurrentQuest) {
          this.questHorizonalPos.set(-1318, [this.localPlayer]);
        }

        this.uiRoot.async.setTimeout(() => {
          this.waitingOnQuestComplete = false;
          if (completedCurrentQuest) {
            if (this.playerQuests.activeQuests.length > 0) {
              this.onStartQuestForPlayer(this.playerQuests.activeQuests[this.playerQuests.currentQuestIndex]);
            }
          } else {
            // Just need to update title since the quest didn't change
            this.updateQuestTitle();
          }
        }, ANIMATION_DURATION + PAUSE_DURATION);
      }, UI_QuestCompleteHud.DISPLAY_TIME)
  }

  updateQuestTitle() {
    let pageText = "";
    if (this.playerQuests.activeQuests.length > 1) {
      pageText = " (" + (this.playerQuests.currentQuestIndex + 1) + "/" + this.playerQuests.activeQuests.length + ")";
    }
    this.questTitle.set("QUEST" + pageText);

    this.isLeftArrowVisible.set(this.playerQuests.currentQuestIndex > 0);
    this.isRightArrowVisible.set(this.playerQuests.currentQuestIndex < this.playerQuests.activeQuests.length - 1);
  }

  updateQuestState(activeQuest: ActiveQuestData) {
    if (this.waitingOnQuestComplete) {
      // We're waiting for the animation to finish, so don't update the UI
      return;
    }
    let target = [this.localPlayer];

    this.updateQuestTitle();

    let subquestStates = activeQuest.subquestStates;

    log.info("Subquest length: " + subquestStates.length);
    for (let i = 0; i < MAX_SUBQUEST_COUNT; i++) {
      if (i >= subquestStates.length) {
        this.subquestViewModels[i].isUsed.set(false, target);
        continue;
      }

      log.info("Subquest text sent: " + subquestStates[i].subquestText);
      this.updateSubquestView(this.subquestViewModels[i], subquestStates[i]);
      this.subquestViewModels[i].isUsed.set(true, target);
    }

    this.questName.set(activeQuest.questName, target);

    let rewards = []
    if (activeQuest.currencyReward > 0) {
      rewards.push(`$${UI_Utils.simplifyNumberToText(activeQuest.currencyReward)}`)
    }
    if (activeQuest.xpReward > 0) {
      rewards.push(`${UI_Utils.simplifyNumberToText(activeQuest.xpReward)} XP`)
    }
    if (activeQuest.gemReward > 0){
      this.gemVisible.set(true, target);
      //const gemPlurality = activeQuest.gemReward > 1 ? 'Gems' : 'Gem'
      rewards.push(`${activeQuest.gemReward}`)
    }

    this.questRewards.set(rewards.join(' + '), target);
  }

  private playQuestCompleteEffect() {
    this.uiRoot.sendNetworkBroadcastEvent(PlayerEffects.questCompleteEffect, {}, [this.localPlayer]);
    this.waitingOnQuestComplete = true;
  }

  private onRightArrowClick() {
    log.info("right arrow clicked");
    this.playerQuests.currentQuestIndex = Math.min(this.playerQuests.currentQuestIndex + 1, this.playerQuests.activeQuests.length - 1);
    this.updateWithCurrentQuest();
    this.uiRoot.sendNetworkBroadcastEvent(QuestEvents.requestCurrentQuestIndexChangedForPlayer, { player: this.localPlayer, index: this.playerQuests.currentQuestIndex }, [this.uiRoot.world.getServerPlayer()]);
  }

  private onLeftArrowClick() {
    log.info("Left arrow clicked");
    this.playerQuests.currentQuestIndex = Math.max(this.playerQuests.currentQuestIndex - 1, 0);
    this.updateWithCurrentQuest();
    this.uiRoot.sendNetworkBroadcastEvent(QuestEvents.requestCurrentQuestIndexChangedForPlayer, { player: this.localPlayer, index: this.playerQuests.currentQuestIndex }, [this.uiRoot.world.getServerPlayer()]);
  }

  private onClick(buttonScale: AnimatedBinding, callback: () => void) {
    if (this.timer.Complete()) {

      callback();
      //buttonScale.set(UI_Utils.buttonAnimation(), () => callback(), [this.localPlayer]);
      this.timer.SetTime(0.1);
    }
  }

  private updateWithCurrentQuest() {
    let currentQuest = this.playerQuests.activeQuests[this.playerQuests.currentQuestIndex];
    this.updateQuestState(currentQuest);
  }

  /// UI STUFF
  panelHeight = 608;
  panelWidth = 1318;

  private timer: Timer = new Timer(0);

  private subquestViewModels: SubquestViewModel[] = [];

  private questName = new Binding("");
  private questHorizonalPos = new Binding(0);
  private questTitle = new Binding("");
  private questRewards = new Binding("");
  private isLeftArrowVisible = new Binding(false);
  private isRightArrowVisible = new Binding(false);
  private newQuestOpacity = new AnimatedBinding(0);
  private leftButtonScale = new AnimatedBinding(1);
  private rightButtonScale = new AnimatedBinding(1);

  updateSubquestView(subquestViewModel: SubquestViewModel, subquestState: SubquestState) {
    let isCompleted = subquestState.count >= subquestState.countRequirement;
    let target = [this.localPlayer];
    subquestViewModel.isCompleted.set(isCompleted, target);
    subquestViewModel.textColor.set(isCompleted ? "#A4A9AE" : "#415369", target);
    subquestViewModel.subquestText.set(subquestState.subquestText, target);
  }

  createSubquestView(subquestViewModel: SubquestViewModel) {
    const subquestView = View({ //Sub Quest 1
      children: [
        View({ //Quest State
          children: [
            View({ //Check box
              style: {
                  width: 20,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: 4,
                  borderWidth: 1.6,
                  borderColor: "#2197FA",
                  backgroundColor: "#FFF",
                  position: "absolute",
                  left: 0,
                  top: 0
              }
          }),
          UINode.if(subquestViewModel.isCompleted, View({ //Completed State
              children: [ Image({ //quest_checkmark
                  source: ImageSource.fromTextureAsset(this.props.quest_checkmark!),

                  style: {
                      width: 16,
                      height: 16,
                      flexShrink: 0
                  }
              }) ],
              style: {
                  display: "flex",
                  width: 20,
                  height: 20,
                  justifyContent: "center",
                  alignItems: "center",
                  flexShrink: 0,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: "#2197FA",
                  backgroundColor: "#45AAFF",
                  flexDirection: "row",
                  position: "absolute",
                  left: 0,
                  top: 0
              }
          })) ],
          style: {
              width: 20,
              height: 20
          }
      }),
      View({ //Spacer
          style: {
              width: 8,
              height: 20
          }
      }),
      Text({ // Quest Content
          text: subquestViewModel.subquestText,
          style: {
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              color: subquestViewModel.textColor,
              fontFamily: "Roboto",
              fontSize: 18,
              fontWeight: "700",
              alignSelf: "stretch",
              //width: 200,
          }
      }) ],
      style: {
          display: "flex",
          alignItems: "flex-start",
          alignSelf: "stretch",
          flexDirection: "row"
      }
    });

    return UINode.if(subquestViewModel.isUsed, subquestView);
  }

  private createAllSubquestViews() {
    const subquestViews: UIChildren[] = [];
    for (let i = 0; i < this.subquestViewModels.length; ++i) {
      subquestViews.push(this.createSubquestView(this.subquestViewModels[i]));
    }

    return View({ //Sub quests
      children: subquestViews,
      style: {
          display: "flex",
          alignSelf: "stretch",
          //width: 233,
          flexDirection: "column",
          alignItems: "flex-start",
          marginTop: 4
      }
    });
  }

  createView(): UINode {
    const root = View({ //UIQuest
      children: [ View({ //Quest Widget
          children: [
            View({ //Quest Content
            children: [
              Text({ // Text Quest Name
                  text: this.questName,
                  style: {
                      alignSelf: "stretch",
                      textAlign: "center",
                      color: "#415369",
                      marginLeft: 24,
                      marginRight: 24,
                      fontFamily: "Roboto",
                      fontSize: 18,
                      fontWeight: "900"
                  }
              }),
              View({ //Divider
                  style: {
                      alignSelf: "stretch",
                      //width: 230,
                      height: 2,
                      borderRadius: 2,
                      backgroundColor: "#D7E8F6",
                      marginTop: 4
                  }
              }),
              this.createAllSubquestViews(),

              /*View({ //Spacer
                style: {
                    width: 230,
                    height: 8,
                }
              }),

              View({ //RewardsGroup
                children: [
                  Image({ //icn_giftBox
                    source: ImageSource.fromTextureAsset(this.props.quest_icn_giftBox!),
                    style: {
                        width: 20,
                        height: 20
                    }
                }),
                View({ //Spacer
                  style: {
                      width: 8,
                      height: 4
                  }
                }),
                  Text({ // Rewards
                    text: this.questRewards,
                    style: {
                      alignSelf: "stretch",
                      color: "#415369",
                      fontFamily: "Roboto",
                      fontSize: 16,
                      fontWeight: "700"
                    }
                  }),
                  UINode.if(this.gemVisible, Image({ //icn_gem
                    source: ImageSource.fromTextureAsset(this.props.icn_gem!),
                    style: {
                      width: 20,
                      height: 20,
                      marginLeft: 2
                    }
                  })
                  ),

                ],

                style: {
                  display: "flex",
                  height: 20,
                  alignItems: "flex-start",
                  alignSelf: "stretch",
                  flexDirection: "row",
                  position: "relative"
                }
              }),*/

            ],
            style: {
                display: "flex",
                width: 280,
                paddingTop: 4,
                paddingRight: 8,
                paddingBottom: 8,
                paddingLeft: 8,
                flexDirection: "column",
                alignItems: "flex-start",
                borderRadius: 8,
                borderWidth: 4,
                borderColor: "#B0D1ED",
                backgroundColor: "#E8F4FF"
            }
          }),
          /*View({ //QuestTitle
              children: [ Text({ // QUEST
                  text: this.questTitle,
                  style: {
                      color: "#415369",
                      textAlign: "center",
                      fontFamily: "Roboto",
                      fontSize: 16,
                      fontWeight: "900"
                  }
              }) ],
              style: {
                  display: "flex",
                  width: 164,
                  height: 24,
                  paddingVertical: 0,
                  paddingHorizontal: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  position: "absolute",
                  left: 47,
                  borderRadius: 16,
                  backgroundColor: "#71BEFF",
                  flexDirection: "row",
                  top: 8
              }
            }),*/
            UINode.if(this.isRightArrowVisible,
              View({ //button_RightQuest
                children: [
                  Pressable({ //BG
                    children: [  ],
                    style: {
                        width: 48,
                        height: 32,
                        position: "absolute",
                        borderRadius: 8,
                        borderBottomWidth: 4,
                        backgroundColor: "#56B2FF",
                        borderColor: "#415369",
                    },
                    onClick: () => this.onClick(this.rightButtonScale, () => this.onRightArrowClick()),
                }),
                Image({ //icn_arrowRight
                    source: ImageSource.fromTextureAsset(this.props.quest_icn_arrowRight!),

                    style: {
                        width: 20,
                        height: 20,
                        position: "absolute",
                        alignSelf: "center",
                        top: 4
                    }
                }) ],
                style: {
                    display: "flex",
                    width: 48,
                    height: 32,
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "absolute",
                    top: 20,
                    borderRadius: 8,
                    right: -8,
                    zIndex: 1,
                    //transform: [{ scale: this.rightButtonScale }]
                }
            })),
            UINode.if(this.isLeftArrowVisible,
              View({ //button_LeftQuest
                children: [
                  Pressable({ //BG
                    children: [  ],
                    style: {
                        width: 48,
                        height: 32,
                        position: "absolute",
                        borderRadius: 8,
                        borderBottomWidth: 4,
                        backgroundColor: "#56B2FF",
                        borderColor: "#415369",
                    },
                    onClick: () => this.onClick(this.leftButtonScale, () => this.onLeftArrowClick()),
                }),
                Image({ //icn_arrowLeft
                    source: ImageSource.fromTextureAsset(this.props.quest_icn_arrowLeft!),

                    style: {
                        width: 20,
                        height: 20,
                        position: "absolute",
                        alignSelf: "center",
                        top: 4
                    }
                }) ],
                style: {
                    display: "flex",
                    width: 48,
                    height: 32,
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    position: "absolute",
                    top: 20,
                    borderRadius: 8,
                    left: -8,
                    zIndex: 1,
                    //transform: [{ scale: this.leftButtonScale }]
                },

            })),
            Image({ //icn_newIndicator
                source: ImageSource.fromTextureAsset(this.props.quest_icn_newIndicator!),
                style: {
                    width: 42,
                    height: 42,
                    position: "absolute",
                    right: -10,
                    top: 50,
                    resizeMode: "cover",
                    opacity: this.newQuestOpacity.interpolate([0, 1], [0.0, 1.0]),
                }
            }) ],
            style: {
                display: "flex",
                paddingTop: 16,
                paddingRight: 4,
                paddingBottom: 4,
                paddingLeft: 4,
                flexDirection: "column",
                alignItems: "flex-start",
                position: "absolute",
                left: this.questHorizonalPos,
                // left: 76,
                // top: 64,
            },
        }) ],
        style: {
            display: "flex",
            width: 1318,
            height: 608,
            paddingVertical: 80,
            paddingHorizontal: 92.8,
            flexDirection: "column",
            alignItems: "flex-start",
            flexShrink: 0,
            position: "absolute",
            left: '5.8%',
            top: '10.5%',
        }
    })

  return UINode.if(this.hudElementVisible.isVisible(), root);
  }
}

class SubquestViewModel {
  public subquestText: Binding<string> = new Binding("");
  public isCompleted: Binding<boolean> = new Binding(false);
  public textColor: Binding<string> = new Binding("#ffffff");
  public isUsed: Binding<boolean> = new Binding(false);
}
