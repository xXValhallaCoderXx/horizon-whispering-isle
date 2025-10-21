/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { ClientStartupReporter } from 'ClientStartupReporter';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import * as hz from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageProps, ImageSource, Pressable, Text, UIComponent, UINode, View } from 'horizon/ui';
import { OverlayId } from 'OverlayId';
import { PlayerInteractionTrigger } from 'PlayerInteractionTrigger';
import { NotificationControlValues, TutorialNotificationManager } from 'TutorialNotificationManager';

const disableContext = "tutorial_overlay";

export class TutorialNotificationUI extends UIComponent<typeof TutorialNotificationUI> {
  static propsDefinition = {
    textColor: { type: hz.PropTypes.Color },
    titleTextColor: { type: hz.PropTypes.Color },
    titleBgColor: { type: hz.PropTypes.Color },
    titleBgOutlineColor: { type: hz.PropTypes.Color },
    bgColor: { type: hz.PropTypes.Color },
    borderColor: { type: hz.PropTypes.Color },
    buttonColor: { type: hz.PropTypes.Color },
    questOverlayAsset: { type: hz.PropTypes.Asset },
    shovelOverlayAsset: { type: hz.PropTypes.Asset },
    actionOverlayAsset: { type: hz.PropTypes.Asset },
    arrowOverlayAsset: { type: hz.PropTypes.Asset },
    zoneOverlayAsset: { type: hz.PropTypes.Asset },
    regionOverlayAsset: { type: hz.PropTypes.Asset },
    catalogOverlayAsset: { type: hz.PropTypes.Asset },
    shovelInventoryOverlayAsset: { type: hz.PropTypes.Asset },
    catalogMainOverlayAsset: { type: hz.PropTypes.Asset },
    catalogCatagoryOverlayAsset: { type: hz.PropTypes.Asset },
    catalogIslandsOverlayAsset: { type: hz.PropTypes.Asset },
    catalogCompleteOverlayAsset: { type: hz.PropTypes.Asset },
    catalogHintOverlayAsset: { type: hz.PropTypes.Asset },
    catalogSideOverlayAsset: { type: hz.PropTypes.Asset },
    catalogImageHintAsset: { type: hz.PropTypes.Asset },
    shovelMiddleOverlayAsset: { type: hz.PropTypes.Asset },
    shovelMiddleCategoryOverlayAsset: { type: hz.PropTypes.Asset },
    shovelFirstAsset: { type: hz.PropTypes.Asset },
    shovelFirstCategoryAsset: { type: hz.PropTypes.Asset },
    shovelFirstEquipAsset: { type: hz.PropTypes.Asset },
    regionPunchcardAsset: { type: hz.PropTypes.Asset },
    regionTipsAsset: { type: hz.PropTypes.Asset },
    regionRecsAsset: { type: hz.PropTypes.Asset },
    regionRewardAsset: { type: hz.PropTypes.Asset },
    regionCloseAsset: { type: hz.PropTypes.Asset },
    regionClaimAsset: { type: hz.PropTypes.Asset },
    regionResetAsset: { type: hz.PropTypes.Asset },
    regionLevelAsset: { type: hz.PropTypes.Asset },
    gemHudAsset: { type: hz.PropTypes.Asset },
    shovelUpgradeAsset: { type: hz.PropTypes.Asset },
    shovelLevelAsset: { type: hz.PropTypes.Asset },
    multipleQuestsAsset: { type: hz.PropTypes.Asset },
  };

  panelHeight = 250;
  panelWidth = 250;

  public static ANIMATION_TIME = 0.5 * 1000

  private context!: Binding<string>;
  private message!: Binding<string>;

  private posAnimation!: AnimatedBinding;
  private opacityAnimation!: AnimatedBinding;
  private canContinue = false

  private showQuest!: Binding<boolean>;
  private showArrow!: Binding<boolean>;
  private showShovel!: Binding<boolean>;
  private showAction!: Binding<boolean>;
  private showZone!: Binding<boolean>;
  private showRegion!: Binding<boolean>;
  private showCatalog!: Binding<boolean>;
  private showShovelInventory!: Binding<boolean>;
  private catalogMain!: Binding<boolean>;
  private catalogCatagory!: Binding<boolean>;
  private catalogIslands!: Binding<boolean>;
  private catalogComplete!: Binding<boolean>;
  private catalogHint!: Binding<boolean>;
  private catalogSide!: Binding<boolean>;
  private catalogImageHint!: Binding<boolean>;
  private shovelMiddle!: Binding<boolean>;
  private shovelMiddleCategory!: Binding<boolean>;
  private shovelFirst!: Binding<boolean>;
  private shovelFirstCategory!: Binding<boolean>;
  private shovelFirstEquip!: Binding<boolean>;
  private regionPunchcard!: Binding<boolean>;
  private regionTips!: Binding<boolean>;
  private regionRecs!: Binding<boolean>;
  private regionReward!: Binding<boolean>;
  private regionClose!: Binding<boolean>;
  private regionClaim!: Binding<boolean>;
  private regionReset!: Binding<boolean>;
  private regionLevel!: Binding<boolean>;
  private gemHud!: Binding<boolean>;
  private shovelUpgrade!: Binding<boolean>;
  private shovelLevel!: Binding<boolean>;
  private showBg!: Binding<boolean>;
  private showContinueText!: Binding<boolean>;
  private showMutlipleQuests!: Binding<boolean>;

  private doNotShowContinue = new Set<number>([
    OverlayId.SHOVEL_FIRST_EQUIP,
  ])

  start() {
    this.entity.visible.set(false)
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      return
    }

    this.connectNetworkEvent(this.entity, TutorialNotificationManager.sendDataToUi, (payload) => {
      this.onDataReceived(payload.context, payload.message, payload.minimumTime, payload.overlayId, payload.showHUDElement)
    })
    ClientStartupReporter.addEntry("TutorialNotificationUI start()", this);
  }

  receiveOwnership(_serializableState: hz.SerializableState, _oldOwner: hz.Player, _newOwner: hz.Player): void {
    if (this.world.getLocalPlayer() !== this.world.getServerPlayer()) {
      ClientStartupReporter.addEntry("TutorialNotificationUI receiveOwnership()");
    }
  }

  /**
  * Handles notification data received from the TutorialNotificationManager
  * @param context The title text for the notification
  * @param message The main content text for the notification
  * @param minimumTime Time in seconds before notification can be dismissed, or special control values
  * @param overlayId The type of overlay to display
  */
  private onDataReceived(context: string, message: string, minimumTime: number, overlayId: number, showHUDElement: HUDElementType) {
    if (minimumTime === NotificationControlValues.FORCE_CLEAR) {
      this.canContinue = true
      this.onContinuePressed()
      return
    }

    const localPlayer = [this.world.getLocalPlayer()];
    this.showContinueText.set(false, localPlayer)

    const pos01 = this.getPos01(overlayId)
    this.posAnimation.set((Animation.timing(pos01, { duration: TutorialNotificationUI.ANIMATION_TIME, easing: Easing.inOut(Easing.ease) })), undefined, localPlayer)
    this.opacityAnimation.set((Animation.timing(1, { duration: TutorialNotificationUI.ANIMATION_TIME, easing: Easing.inOut(Easing.ease) })), undefined, localPlayer)

    this.showQuest.set(overlayId === OverlayId.QUEST, localPlayer)
    this.showArrow.set(overlayId === OverlayId.ARROW, localPlayer)
    this.showShovel.set(overlayId === OverlayId.SHOVEL, localPlayer)
    this.showAction.set(overlayId === OverlayId.ACTION, localPlayer)
    this.showZone.set(overlayId === OverlayId.ZONE, localPlayer)
    this.showRegion.set(overlayId === OverlayId.REGION, localPlayer)
    this.showCatalog.set(overlayId === OverlayId.CATALOG, localPlayer)
    this.showShovelInventory.set(overlayId === OverlayId.SHOVEL_INVENTORY, localPlayer)
    this.catalogMain.set(overlayId === OverlayId.CATALOG_MAIN, localPlayer)
    this.catalogCatagory.set(overlayId === OverlayId.CATALOG_CATEGORY, localPlayer)
    this.catalogIslands.set(overlayId === OverlayId.CATALOG_ISLANDS, localPlayer)
    this.catalogComplete.set(overlayId === OverlayId.CATALOG_COMPLETE, localPlayer)
    this.catalogHint.set(overlayId === OverlayId.CATALOG_HINT, localPlayer)
    this.catalogSide.set(overlayId === OverlayId.CATALOG_SIDE, localPlayer)
    this.catalogImageHint.set(overlayId === OverlayId.CATALOG_IMAGE_HINT, localPlayer)
    this.shovelMiddle.set(overlayId === OverlayId.SHOVEL_MIDDLE, localPlayer)
    this.shovelMiddleCategory.set(overlayId === OverlayId.SHOVEL_MIDDLE_CATEGORY, localPlayer)
    this.shovelFirst.set(overlayId === OverlayId.SHOVEL_FIRST, localPlayer)
    this.shovelFirstCategory.set(overlayId === OverlayId.SHOVEL_FIRST_CATEGORY, localPlayer)
    this.shovelFirstEquip.set(overlayId === OverlayId.SHOVEL_FIRST_EQUIP, localPlayer)
    this.regionPunchcard.set(overlayId === OverlayId.REGION_PUNCHCARD, localPlayer)
    this.regionTips.set(overlayId === OverlayId.REGION_TIPS, localPlayer)
    this.regionRecs.set(overlayId === OverlayId.REGION_RECS, localPlayer)
    this.regionReward.set(overlayId === OverlayId.REGION_REWARD, localPlayer)
    this.regionClose.set(overlayId === OverlayId.REGION_CLOSE, localPlayer)
    this.regionClaim.set(overlayId === OverlayId.REGION_CLAIM, localPlayer)
    this.regionReset.set(overlayId === OverlayId.REGION_RESET, localPlayer)
    this.regionLevel.set(overlayId === OverlayId.REGION_LEVEL, localPlayer)
    this.gemHud.set(overlayId === OverlayId.GEM_HUD, localPlayer)
    this.shovelUpgrade.set(overlayId === OverlayId.SHOVEL_UPGRADE, localPlayer)
    this.shovelLevel.set(overlayId === OverlayId.SHOVEL_LEVEL, localPlayer)
    this.showMutlipleQuests.set(overlayId === OverlayId.MULTIPLE_QUESTS, localPlayer)
    this.showBg.set(overlayId === OverlayId.NONE, localPlayer)

    this.entity.visible.set(true)

    this.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context: disableContext }, localPlayer)
    this.sendLocalBroadcastEvent(Events.localHideHUD, { context: disableContext, exclude: showHUDElement | ~(HUDElementType.DigAction) }) // this disables just the npc interaction trigger instead of any HUD elements

    this.context.set(context, localPlayer)
    this.message.set(message, localPlayer)

    if (minimumTime > 0) {
      this.canContinue = false

      this.async.setTimeout(() => {
        this.canContinue = true
        this.showContinueText.set(!this.doNotShowContinue.has(overlayId), localPlayer)
      }, minimumTime * 1000)
    }
    else if (minimumTime === NotificationControlValues.UNSKIPPABLE) { // freeze this notification until the manager prompts it to disappear
      this.canContinue = false
    }
    else {
      this.canContinue = true
    }
  }

  /**
  * Determines the vertical position of the notification based on overlay type
  * Lower numbers are higher on the screen
  * @param overlayId The type of overlay being displayed
  * @returns A normalized position value between 0-1
  */
  private getPos01(overlayId: number): number {
    switch (overlayId) {
      case OverlayId.REGION:
      case OverlayId.REGION_PUNCHCARD:
      case OverlayId.REGION_TIPS:
      case OverlayId.REGION_RECS:
      case OverlayId.REGION_CLAIM:
      case OverlayId.REGION_LEVEL:
      case OverlayId.REGION_RESET:
      case OverlayId.CATALOG_ISLANDS:
      case OverlayId.SHOVEL_LEVEL:
        return 0.62
      case OverlayId.CATALOG_MAIN:
        return 0.36
      case OverlayId.CATALOG_COMPLETE:
        return 0.63
      case OverlayId.REGION_CLOSE:
      case OverlayId.REGION_REWARD:
        return 0.68
      default:
        return 0.4 // touches just the top of screen
    }
  }

  private onContinuePressed() {
    if (this.canContinue) {
      const localPlayer = this.world.getLocalPlayer();
      this.canContinue = false

      this.posAnimation.set((Animation.timing(0, { duration: TutorialNotificationUI.ANIMATION_TIME, easing: Easing.inOut(Easing.ease) })), undefined, [localPlayer])
      this.opacityAnimation.set((Animation.timing(0, { duration: TutorialNotificationUI.ANIMATION_TIME, easing: Easing.inOut(Easing.ease) })), undefined, [localPlayer])

      this.async.setTimeout(() => {
        this.sendNetworkEvent(this.entity, TutorialNotificationManager.notificationCleared, { player: localPlayer })
        this.entity.visible.set(false)
        this.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context: disableContext }, [localPlayer])
        this.sendLocalBroadcastEvent(Events.localShowHUD, { context: disableContext })
      }, TutorialNotificationUI.ANIMATION_TIME)
    }
  }

  private getImageNode(texture: hz.Asset): UINode<ImageProps> {
    return Image({
      source: ImageSource.fromTextureAsset(texture),
      style: {
        width: '100%',
        height: '100%'
      }
    })
  }

  initializeUI() {
    if (this.world.getLocalPlayer() === this.world.getServerPlayer()) {
      return View({
        children: [
          Image({ source: ImageSource.fromTextureAsset(this.props.questOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.actionOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.arrowOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.zoneOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelInventoryOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogMainOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogCatagoryOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogIslandsOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogCompleteOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogHintOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogSideOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.catalogImageHintAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelMiddleOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelMiddleCategoryOverlayAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelFirstAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelFirstCategoryAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelFirstEquipAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionPunchcardAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionTipsAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionRecsAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionRewardAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionCloseAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionClaimAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionResetAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.regionLevelAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.gemHudAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelUpgradeAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.shovelLevelAsset!), style: { display: "none" } }),
          Image({ source: ImageSource.fromTextureAsset(this.props.multipleQuestsAsset!), style: { display: "none" } }),
        ],
        style: { display: "none" }
      });
    }

    this.context = new Binding<string>("CONTEXT");
    this.message = new Binding<string>("Message");
    this.posAnimation = new AnimatedBinding(0)
    this.opacityAnimation = new AnimatedBinding(0)
    this.showQuest = new Binding<boolean>(false)
    this.showArrow = new Binding<boolean>(false)
    this.showShovel = new Binding<boolean>(false)
    this.showAction = new Binding<boolean>(false)
    this.showZone = new Binding<boolean>(false)
    this.showRegion = new Binding<boolean>(false)
    this.showCatalog = new Binding<boolean>(false)
    this.showShovelInventory = new Binding<boolean>(false)
    this.catalogMain = new Binding<boolean>(false)
    this.catalogCatagory = new Binding<boolean>(false)
    this.catalogIslands = new Binding<boolean>(false)
    this.catalogComplete = new Binding<boolean>(false)
    this.catalogHint = new Binding<boolean>(false)
    this.catalogSide = new Binding<boolean>(false)
    this.catalogImageHint = new Binding<boolean>(false)
    this.shovelMiddle = new Binding<boolean>(false)
    this.shovelMiddleCategory = new Binding<boolean>(false)
    this.shovelFirst = new Binding<boolean>(false)
    this.shovelFirstCategory = new Binding<boolean>(false)
    this.shovelFirstEquip = new Binding<boolean>(false)
    this.regionPunchcard = new Binding<boolean>(false)
    this.regionTips = new Binding<boolean>(false)
    this.regionRecs = new Binding<boolean>(false)
    this.regionReward = new Binding<boolean>(false)
    this.regionClose = new Binding<boolean>(false)
    this.regionClaim = new Binding<boolean>(false)
    this.regionReset = new Binding<boolean>(false)
    this.regionLevel = new Binding<boolean>(false)
    this.gemHud = new Binding<boolean>(false)
    this.shovelUpgrade = new Binding<boolean>(false)
    this.shovelLevel = new Binding<boolean>(false)
    this.showBg = new Binding<boolean>(false)
    this.showContinueText = new Binding<boolean>(false)
    this.showMutlipleQuests = new Binding<boolean>(false)

    const quest = this.getImageNode(this.props.questOverlayAsset!)
    const shovel = this.getImageNode(this.props.shovelOverlayAsset!)
    const action = this.getImageNode(this.props.actionOverlayAsset!)
    const arrow = this.getImageNode(this.props.arrowOverlayAsset!)
    const zone = this.getImageNode(this.props.zoneOverlayAsset!)
    const region = this.getImageNode(this.props.regionOverlayAsset!)
    const catalog = this.getImageNode(this.props.catalogOverlayAsset!)
    const shovelInventory = this.getImageNode(this.props.shovelInventoryOverlayAsset!)
    const catalogMain = this.getImageNode(this.props.catalogMainOverlayAsset!)
    const catalogCatagory = this.getImageNode(this.props.catalogCatagoryOverlayAsset!)
    const catalogIslands = this.getImageNode(this.props.catalogIslandsOverlayAsset!)
    const catalogComplete = this.getImageNode(this.props.catalogCompleteOverlayAsset!)
    const catalogHint = this.getImageNode(this.props.catalogHintOverlayAsset!)
    const catalogSide = this.getImageNode(this.props.catalogSideOverlayAsset!)
    const catalogImageHint = this.getImageNode(this.props.catalogImageHintAsset!)
    const shovelMiddle = this.getImageNode(this.props.shovelMiddleOverlayAsset!)
    const shovelMiddleCategory = this.getImageNode(this.props.shovelMiddleCategoryOverlayAsset!)
    const shovelFirst = this.getImageNode(this.props.shovelFirstAsset!)
    const shovelFirstCategory = this.getImageNode(this.props.shovelFirstCategoryAsset!)
    const shovelFirstEquip = this.getImageNode(this.props.shovelFirstEquipAsset!)
    const regionPunchcard = this.getImageNode(this.props.regionPunchcardAsset!)
    const regionTips = this.getImageNode(this.props.regionTipsAsset!)
    const regionRecs = this.getImageNode(this.props.regionRecsAsset!)
    const regionReward = this.getImageNode(this.props.regionRewardAsset!)
    const regionClose = this.getImageNode(this.props.regionCloseAsset!)
    const regionClaim = this.getImageNode(this.props.regionClaimAsset!)
    const regionReset = this.getImageNode(this.props.regionResetAsset!)
    const regionLevel = this.getImageNode(this.props.regionLevelAsset!)
    const gemHud = this.getImageNode(this.props.gemHudAsset!)
    const shovelUpgrade = this.getImageNode(this.props.shovelUpgradeAsset!)
    const shovelLevel = this.getImageNode(this.props.shovelLevelAsset!)
    const multipleQuests = this.getImageNode(this.props.multipleQuestsAsset!)

    const defaultBackground = View({
      style: {
        top: '0%',
        bottom: '100%',
        left: '0%',
        right: '100%',
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
        opacity: this.opacityAnimation.interpolate([0, 1], [0, 0.9])
      },
    })

    const continueButton = Pressable({
      children: [
        Text({
          text: 'Continue',
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexShrink: 0,
            alignSelf: "stretch",
            textAlign: "center",
            textAlignVertical: "center",
            color: "#FFF",
            fontSize: 30,
            fontFamily: "Roboto",
            fontWeight: "700"
          },
        }),
      ],
      style: {
        display: "flex",
        position: 'absolute',
        borderRadius: 16,
        height: 48,
        width: 180,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        borderBottomWidth: 4,
        backgroundColor: "#70C04E",
        borderColor: "#49A24C",
        alignSelf: 'center',
        flexDirection: "row",
        bottom: '23%',
        zIndex: 2
      },
      onClick: () => this.onContinuePressed(),
    })

    const overlay = View({
      children: [
        UINode.if(this.showContinueText, continueButton),
        UINode.if(this.showQuest, quest),
        UINode.if(this.showShovel, shovel),
        UINode.if(this.showAction, action),
        UINode.if(this.showArrow, arrow),
        UINode.if(this.showZone, zone),
        UINode.if(this.showRegion, region),
        UINode.if(this.showCatalog, catalog),
        UINode.if(this.showShovelInventory, shovelInventory),
        UINode.if(this.showBg, defaultBackground),
        UINode.if(this.catalogMain, catalogMain),
        UINode.if(this.catalogCatagory, catalogCatagory),
        UINode.if(this.catalogIslands, catalogIslands),
        UINode.if(this.catalogComplete, catalogComplete),
        UINode.if(this.catalogHint, catalogHint),
        UINode.if(this.catalogSide, catalogSide),
        UINode.if(this.catalogImageHint, catalogImageHint),
        UINode.if(this.shovelMiddleCategory, shovelMiddleCategory),
        UINode.if(this.shovelFirstCategory, shovelFirstCategory),
        UINode.if(this.shovelFirst, shovelFirst),
        UINode.if(this.regionPunchcard, regionPunchcard),
        UINode.if(this.regionTips, regionTips),
        UINode.if(this.regionRecs, regionRecs),
        UINode.if(this.regionReward, regionReward),
        UINode.if(this.regionClose, regionClose),
        UINode.if(this.regionClaim, regionClaim),
        UINode.if(this.regionReset, regionReset),
        UINode.if(this.regionLevel, regionLevel),
        UINode.if(this.gemHud, gemHud),
        UINode.if(this.shovelLevel, shovelLevel),
        UINode.if(this.shovelUpgrade, shovelUpgrade),
        UINode.if(this.showMutlipleQuests, multipleQuests),
      ],
      style: {
        left: '0%',
        right: '100%',
        top: '0%',
        bottom: '100%',
        opacity: this.opacityAnimation.interpolate([0, 1], [0, 1])
      },
    })

    const pressableOverlay = Pressable({ // some overlays need to be pressable because we cannot click interactive+blocking UI elements that are behind them
      children: [
        UINode.if(this.shovelMiddle, shovelMiddle),
        UINode.if(this.shovelFirstEquip, shovelFirstEquip),
      ],
      style: {
        left: '0%',
        right: '100%',
        top: '0%',
        bottom: '100%',
        opacity: this.opacityAnimation.interpolate([0, 1], [0, 1])
      },
      onClick: () => this.onContinuePressed(),
    })

    const bannerUi = View({
      children: [
        View({
          children: Text({
            text: this.context, style: { // context
              fontSize: 22,
              fontFamily: 'Roboto',
              color: this.props.titleTextColor,
              textAlign: 'center',
              fontWeight: '900',
            }
          }),
          style: {
            backgroundColor: this.props.titleBgColor,
            borderRadius: 24,
            paddingHorizontal: 72,
            top: -22,
            opacity: 1,
          }
        }),
        Text({
          text: this.message, style: { // message
            fontSize: 24,
            fontFamily: 'Roboto',
            color: this.props.textColor,
            paddingBottom: 22,
            textAlign: 'center',
            fontWeight: '900',
          }
        }),
      ],
      style: {
        alignItems: 'center',
        backgroundColor: this.props.bgColor,
        borderColor: this.props.borderColor,
        borderWidth: 4,
        borderRadius: 24,
        flexDirection: 'column',
        width: '39%',
        paddingHorizontal: 32,
        alignSelf: 'center',
        justifyContent: 'center',
        position: 'absolute',
        top: this.posAnimation.interpolate([0, 1], ['-50%', '100%']),
        opacity: 1
      },
    })
    ClientStartupReporter.addEntry("TutorialNotificationUI initializeUI()");
    return View({
      children: [
        overlay,
        pressableOverlay,
        bannerUi
      ]
    })
  }
}
UIComponent.register(TutorialNotificationUI);
