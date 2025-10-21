/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { CategoryUIData } from 'CategoryUIData';
import { HUDElementType } from 'Enums';
import { Events } from 'Events';
import { Asset, AudioGizmo, CodeBlockEvents, EventSubscription, Player } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { HUDAnimations } from 'HUDAnimations';
import { Logger } from 'Logger';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { PlayerInventoryData } from 'PlayerInventoryData';
import { Shovel } from 'Shovel';
import { ShovelData } from 'ShovelData';
import { ShovelProgressionEvents } from 'ShovelProgressionEvents';
import { UI_Utils } from 'UI_Utils';
import { UIView_InteractionBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionBlocking } from 'UIRoot_InteractionBlocking';
import { ShovelutionEvents } from 'UIView_Shovelution';

const SHOVELS_DISPLAYED_PER_PAGE = 3;
const MAX_RARITY_STARS = 0;
const CATEGORIES_PER_ROW = 3;
const CATEGORY_ROWS = 2;
const MAX_CATEGORIES = CATEGORIES_PER_ROW * CATEGORY_ROWS;
const SHOW_MISSING_STARS = false;
const OUTLINE_SIZE = 1;

const UPGRADE_ANIM_TIME = 1.2;

const SHOVELUTION_CLEAR_TIME = 0.5 * 1000

const log = new Logger("UIView_ShovelInventory");

export class UIView_ShovelInventory extends UIView_InteractionBlockingBase {
  private isOpen = false;
  private currentPageIndex = 0;
  private currentShovel = "";
  private shovels = new Array<ShovelData>; // shovels owned
  private shovelPanels = new Array<ShovelPanelViewModel>;
  private exitFocusEvent?: EventSubscription;

  private isOpenBinding!: Binding<boolean>;
  private isLeftArrowShown!: Binding<boolean>;
  private isRightArrowShown!: Binding<boolean>;
  private gemsCountBinding = new Binding('');

  private gemCount = 0;
  private canUpgradeAny = false;
  private starAnimationRunning = false;

  private upgradeStarX = new AnimatedBinding(0);
  private upgradeStarY = new AnimatedBinding(0);
  private upgradeStarScale = new AnimatedBinding(0);

  private consecutiveUpgradeId: string | undefined = undefined;

  // cache for shovelution
  private shovelIdForShovelution: string = "";
  private levelForShovelution: number = 0;
  private shovelutionViewModel: ShovelutionStatChangeViewModel = new ShovelutionStatChangeViewModel();

  private bgOpacity = new AnimatedBinding(0);

  constructor(uiRoot: UIRoot_InteractionBlocking) {
    super(uiRoot);

    this.uiRoot.connectNetworkBroadcastEvent(Events.playerStartDig, payload => this.onDigStart(payload.player));
    this.uiRoot.connectLocalBroadcastEvent(ShovelProgressionEvents.requestToggleShovelInventory, payload => this.setOpen(!this.isOpen));
    this.uiRoot.connectNetworkBroadcastEvent(ShovelProgressionEvents.forceCloseShovelInventory, payload => this.setOpen(false))
    this.uiRoot.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventoryDataResponse, payload => this.onInventoryDataResponse(payload.data));
    this.uiRoot.connectNetworkBroadcastEvent(PlayerDataEvents.gemsUpdated, payload => {
      this.gemCount = payload.gems;
      this.checkUpgrade()
    })
    this.uiRoot.connectLocalBroadcastEvent(Events.localSetShovelLevel, payload => {
      this.populatePageDisplayItems();
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.requestUpgradeAnyShovelUpdated, () => this.checkUpgrade());

    this.uiRoot.connectNetworkBroadcastEvent(ShovelProgressionEvents.shovelGivenToPlayer, payload => this.reload());
    this.uiRoot.connectLocalBroadcastEvent(ShovelutionEvents.play, payload => this.setOpen(false));
    this.uiRoot.connectLocalBroadcastEvent(ShovelutionEvents.end, payload => this.setOpen(true));

    this.reload();
  }

  private onDigStart(player: Player) {
    log.info(`Received dig start.`);
    if (player == this.localPlayer) {
      this.setOpen(false);
    }
  }

  private onInventoryDataResponse(data: PlayerInventoryData): void {
    this.currentShovel = data.shovelId;
    let shovelIndex = data.shovels.indexOf(this.currentShovel)
    shovelIndex = Math.floor(shovelIndex / SHOVELS_DISPLAYED_PER_PAGE)

    this.currentPageIndex = Math.max(shovelIndex, 0);
    this.populateShovels(data);
    this.refresh();
  }

  private checkUpgrade() {
    if (this.isOpen){
      return
    }

    this.canUpgradeAny = false;

    for (let i = 0; i < this.shovels.length; i++) {
      const shovelData = this.shovels[i];
      const currentLevel = Shovel.getLevel(shovelData.id);
      const gemsRequired = shovelData.levelData[currentLevel]?.Gems ?? 1;

      if (this.gemCount >= gemsRequired) {
        this.canUpgradeAny = true;
        break;
      }
    }
    this.uiRoot.sendLocalBroadcastEvent(Events.canUpgradeAnyShovelUpdated, { canUpgradeAny: this.canUpgradeAny });
  }

  private setOpen(isOpen: boolean) {
    if (this.isOpen === isOpen) {
      return;
    }
    this.isOpen = isOpen;
    this.isOpenBinding.set(isOpen, [this.localPlayer]);
    this.uiRootBlocking.setVisibility(isOpen);
    this.updateHUD(this.localPlayer);
    if (this.isOpen) {
      this.reload();
    }
    else{
      this.consecutiveUpgradeId = undefined;
    }
    this.uiRoot.sendLocalBroadcastEvent(ShovelProgressionEvents.shovelInventoryVisibilityChanged, { isShown: isOpen });
  }

  private updateHUD(localPlayer: Player) {
    const context = "shovel_inventory_open";
    if (this.isOpen) {
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context, exclude: HUDElementType.None });
      localPlayer.enterFocusedInteractionMode();
      this.exitFocusEvent = this.uiRoot.connectCodeBlockEvent(this.uiRoot.entity,
        CodeBlockEvents.OnPlayerExitedFocusedInteraction,
        player => this.onExitFocusedInteraction(player));
    } else {
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context });
      this.exitFocusEvent?.disconnect();
      this.exitFocusEvent = undefined;
      localPlayer.exitFocusedInteractionMode();
    }
  }

  private onExitFocusedInteraction(player: Player): void {
    if (this.localPlayer !== player) {
      return;
    }
    this.setOpen(false);
  }

  private reload() {
    this.uiRoot.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventoryData, { player: this.localPlayer }, [this.uiRoot.world.getServerPlayer()]);
  }

  private refresh() {
    this.populatePageDisplayItems();
    this.updateArrowVisibility();
  }

  private populateShovels(data: PlayerInventoryData) {
    this.shovels = [];
    if (data == null) {
      return;
    }
    for (let i = 0; i < data.shovels.length; ++i) {
      const shovelId = data.shovels[i];
      const tuningData = Shovel.getData(shovelId, 0);
      if (tuningData === undefined) {
        log.warn(`Cannot find tuning data for shovelID (${shovelId})`);
        continue;
      }
      this.shovels.push(tuningData);
    }
  }

  private setupShovelGridViewModels() {
    for (let i = 0; i < SHOVELS_DISPLAYED_PER_PAGE; ++i) {
      const shovelPanel = new ShovelPanelViewModel(ImageSource.fromTextureAsset(this.props.shovelInventory_missingShovel!));
      for (let j = 0; j < MAX_RARITY_STARS; ++j) {
        shovelPanel.rarityStars.push(new ShovelPanelRarityStarViewModel(ImageSource.fromTextureAsset(this.props.shovelInventory_fullstar!)));
      }
      for (let j = 0; j < CATEGORY_ROWS * CATEGORIES_PER_ROW; ++j) {
        shovelPanel.categories.push(new ShovelPanelCategoryViewModel());
      }
      this.shovelPanels.push(shovelPanel);
    }
  }

  private pageForward() {
    log.info(`Turning page forward.`);
    this.currentPageIndex = Math.min(this.currentPageIndex + 1, this.getPageCount() - 1);
    this.refresh();
  }

  private pageBackward() {
    log.info(`Turning page backward.`);
    this.currentPageIndex = Math.max(this.currentPageIndex - 1, 0);
    this.refresh();
  }

  private canPageForward() {
    return this.currentPageIndex < (this.getPageCount() - 1);
  }

  private canPageBackward() {
    return this.currentPageIndex > 0;
  }

  private onEquipSelected(player: Player, shovelId: string) {
    log.info(`Equipping shovel (${shovelId}) for player (${player.id})`);
    this.uiRoot.sendNetworkBroadcastEvent(ShovelProgressionEvents.requestSetShovelForPlayer, { player, shovelId }, [this.uiRoot.world.getServerPlayer()]);
    this.setOpen(false);
  }

  private canUpgrade(data: ShovelData, shovelLevel: number): boolean {
    const isMaxLevel = data.evolutionLevel === 0;
    return !isMaxLevel && this.gemCount >= (data.levelData[shovelLevel]?.Gems ?? 1);
  }

  private onUpgradeSelected(player: Player, viewModel: ShovelPanelViewModel, shovelId: string) {
    if (!this.starAnimationRunning) {
      const currentLevel = Shovel.getLevel(shovelId);
      const data = Shovel.getData(shovelId, currentLevel)!

      if (this.canUpgrade(data, currentLevel)) {
        const upgradeTime = this.consecutiveUpgradeId === shovelId ? UPGRADE_ANIM_TIME * 0.666 : UPGRADE_ANIM_TIME;
        this.consecutiveUpgradeId = shovelId;

        const targetPlayer = [this.localPlayer];

        this.starAnimationRunning = true;
        let isEvolution = data.evolution.length > 0 && currentLevel === data.evolutionLevel - 1
        this.enableUpgradeButton(viewModel, false, isEvolution, targetPlayer);

        // Pulse the button
        viewModel.upgradeButtonScale.set(UI_Utils.buttonAnimation(), undefined, targetPlayer);
        viewModel.upgradeStarVisible.set(true, targetPlayer);

        HUDAnimations.flyStar(this.uiRoot,
          this.upgradeStarX,
          this.upgradeStarY,
          this.upgradeStarScale,
          upgradeTime * 1000,
        () => {
          const nextLevel = currentLevel + 1;
          const gemsRequired = data.levelData[currentLevel]?.Gems ?? 1;

          this.enableUpgradeButton(viewModel, this.canUpgrade(data, nextLevel), isEvolution, targetPlayer);
          this.uiRoot.sendNetworkBroadcastEvent(Events.requestShovelUpgrade, { player: player, shovelId: shovelId, gemCost: gemsRequired }, [this.serverPlayer]); //update on server
          viewModel.level.set((nextLevel + 1).toString(), targetPlayer); // immediate update on client
          viewModel.upgradeStarVisible.set(false, targetPlayer);
          viewModel.upgradeStarButtonScale.set(UI_Utils.buttonAnimation(1.4, 100), undefined, targetPlayer);

          this.uiRootBlocking.props.fanfare_sound?.as(AudioGizmo).play({
            fade: 0,
            players: targetPlayer,
          })

          if (isEvolution){
            this.uiRoot.sendLocalBroadcastEvent(ShovelutionEvents.play, {id: shovelId, level: currentLevel})
            this.updateShovelutionPanel(shovelId, currentLevel)
          }
          this.starAnimationRunning = false;
        })
      }
    }
  }

  /**
   * Update the shovelution panel to be used after the shovelution animation is complete
   * @param shovelId
   * @param prevLevel previous level of the shovel
   */
  updateShovelutionPanel(shovelId: string, prevLevel: number) {
    this.shovelIdForShovelution = shovelId;
    this.levelForShovelution = prevLevel;
    let target = [this.localPlayer];
    this.bgOpacity.set(0.8, undefined, target);

    this.shovelutionViewModel.isShown.set(true, target);

    /*
    prevAbilityIcon: Binding<ImageSource>;
    newAbilityIcon: Binding<ImageSource>;
    titleText = new Binding("");
    prevLevelStarText = new Binding("");
    newLevelStarText = new Binding("");
    prevStatText = new Binding("");
    newStatText = new Binding("");
    prevStatDescriptionText = new Binding("");
    newStatDescriptionText = new Binding("");
    */

    let prevShovel = Shovel.getData(shovelId, prevLevel)!;
    let newShovel = Shovel.getData(prevShovel.evolution, 0)!;
    let baseShovel = Shovel.getData(prevShovel.baseShovel, 0) ?? prevShovel; // If base shovel doesn't exist, the prev shovel is the base shovel
    let prevAbilityIcon = prevShovel.getAbilityIconAsset();
    if (prevAbilityIcon) {
      this.shovelutionViewModel.prevAbilityIcon.set(ImageSource.fromTextureAsset(prevAbilityIcon), target)
    }
    else {
      this.shovelutionViewModel.prevAbilityIcon.reset()
    }
    let newAbilityIcon = newShovel.getAbilityIconAsset();
    if (newAbilityIcon) {
      this.shovelutionViewModel.newAbilityIcon.set(ImageSource.fromTextureAsset(newAbilityIcon), target)
    }
    else {
      this.shovelutionViewModel.newAbilityIcon.reset()
    }

    this.shovelutionViewModel.titleText.set(`Congrats! ${baseShovel.name} Shovel Evolved!`, target);
    this.shovelutionViewModel.prevLevelStarText.set((prevLevel+1).toString(), target);
    this.shovelutionViewModel.newLevelStarText.set((prevLevel+2).toString(), target);

    // TODO - this needs to be split properly in data
    this.shovelutionViewModel.prevStatText.set("", target);
    this.shovelutionViewModel.newStatText.set("", target);
    this.shovelutionViewModel.prevStatDescriptionText.set(prevShovel.abilityDetails, target);
    this.shovelutionViewModel.newStatDescriptionText.set(newShovel.abilityDetails, target);
  }

  private getPageCount() {
    return Math.max(1, Math.floor((this.shovels.length + SHOVELS_DISPLAYED_PER_PAGE - 1) / SHOVELS_DISPLAYED_PER_PAGE))
  }

  private updateArrowVisibility() {
    this.isLeftArrowShown.set(this.canPageBackward(), [this.localPlayer]);
    this.isRightArrowShown.set(this.canPageForward(), [this.localPlayer]);
  }

  private populatePageDisplayItems() {
    log.info(`Populating currently displayed page (${this.currentPageIndex}).`);
    const offset = this.currentPageIndex * SHOVELS_DISPLAYED_PER_PAGE;
    for (let i = 0; i < SHOVELS_DISPLAYED_PER_PAGE; ++i) {
      const shovelIndex = i + offset;
      if (shovelIndex < this.shovels.length) {
        this.setupShovelPanel(this.shovelPanels[i], this.shovels[shovelIndex]);
      } else {
        this.setupShovelPanel(this.shovelPanels[i], null);
      }
    }
  }

  private setupShovelPanel(viewModel: ShovelPanelViewModel, shovelData: ShovelData | null) {
    const targetPlayer = [this.localPlayer];
    if (shovelData === null || shovelData === undefined) {
      viewModel.isShown.set(false, targetPlayer);
      return;
    }

    viewModel.isShown.set(true, targetPlayer);
    viewModel.shovelId = shovelData.id;
    const currentLevel = Shovel.getLevel(shovelData.id)
    let evolvedShovel = Shovel.getData(shovelData.id, currentLevel);
    if (evolvedShovel === undefined) {
      evolvedShovel = shovelData
    }
    viewModel.displayName.set(evolvedShovel.name, targetPlayer);
    viewModel.level.set((currentLevel + 1).toString(), targetPlayer);
    viewModel.description.set(evolvedShovel.description, targetPlayer);
    viewModel.evolutionLevel.set(evolvedShovel.name ===  'Wooden' ? '...?' : (evolvedShovel.evolutionLevel + 1).toString(), targetPlayer);
    viewModel.canEvolve.set((evolvedShovel.evolutionLevel !== undefined && evolvedShovel.evolutionLevel > 0) || evolvedShovel.name === 'Wooden', targetPlayer);
    viewModel.showEvolutionStarIcon.set(evolvedShovel.evolutionLevel !== undefined && evolvedShovel.evolutionLevel > 0, targetPlayer);
    viewModel.abilityText.set(evolvedShovel.abilityDetails, targetPlayer)
    let abilityIcon = evolvedShovel.getAbilityIconAsset()
    if (abilityIcon) {
      viewModel.abilityIcon.set(ImageSource.fromTextureAsset(abilityIcon), targetPlayer)
    }
    else {
      viewModel.abilityIcon.reset()
    }
    viewModel.shovelImage.set(ImageSource.fromTextureAsset(evolvedShovel.getIconAsset()!), targetPlayer);

    for (let i = 0; i < MAX_CATEGORIES; ++i) {
      // TODO - hook up multiple categories?
      if (i == 0 && evolvedShovel.categoryToBias !== "") {
        this.setupShovelCategory(viewModel.categories[i], evolvedShovel.categoryToBias, targetPlayer);
      } else {
        this.setupShovelCategory(viewModel.categories[i], null, targetPlayer);
      }
    }

    for (let i = 0; i < MAX_RARITY_STARS; ++i) {
      this.setupRarityStar(viewModel.rarityStars[i], evolvedShovel.rarity >= i, targetPlayer);
    }

    this.gemsCountBinding.set(' x' + this.gemCount.toString(), targetPlayer);

    const isEquipped = this.currentShovel === shovelData.id;
    if (isEquipped) {
      viewModel.equipText.set("Equipped", targetPlayer);
      viewModel.equipTextColor.set("#666E66", targetPlayer);
      viewModel.equipBGColor.set("#95A290", targetPlayer);
      viewModel.equipBorderColor.set("#666E66", targetPlayer);
      viewModel.bgColor.set("#ECFFDD", targetPlayer);
      viewModel.borderColor.set("#0ABEBA", targetPlayer);

    } else {
      viewModel.equipText.set("Equip", targetPlayer);
      viewModel.equipTextColor.set("#FFF", targetPlayer);
      viewModel.equipBGColor.set("#70C04E", targetPlayer);
      viewModel.equipBorderColor.set("#49A24C", targetPlayer);
      viewModel.bgColor.set("#FFFCE5", targetPlayer);
      viewModel.borderColor.set("#FFDD88", targetPlayer);
    }

    const isEvolution = evolvedShovel.evolution.length > 0 && currentLevel === evolvedShovel.evolutionLevel - 1
    let upgradeText
    if (evolvedShovel.evolutionLevel === 0){ // reached max level
      upgradeText = 'MAX'
    }
    else{
      const prefix = isEvolution  ? 'Evolve' : 'Upgrade';
      const gemsRequired = shovelData.levelData[currentLevel]?.Gems ?? 1;
      upgradeText = prefix + ': x' + gemsRequired.toString() + ' Gems';
    }

    viewModel.upgradeText.set(upgradeText, targetPlayer);
    const canUpgrade = this.canUpgrade(evolvedShovel, currentLevel);
    viewModel.canUpgrade.set(canUpgrade, targetPlayer);
    this.enableUpgradeButton(viewModel, canUpgrade, isEvolution, targetPlayer);
  }

  private onClickShovelutionButton() {
    this.shovelutionViewModel.isShown.set(false, [this.localPlayer]);
    this.bgOpacity.set(Animation.sequence(
      Animation.timing(0, { duration: SHOVELUTION_CLEAR_TIME, easing: Easing.out(Easing.ease) }),
    ), undefined, [this.localPlayer])
  }

  private enableUpgradeButton(viewModel: ShovelPanelViewModel, value: boolean, isEvolution: boolean, targetPlayer: Player[]) {
    if (isEvolution){
      if (value) {
        viewModel.upgradeTextColor.set("#ffffff", targetPlayer);
        viewModel.upgradeBGColor.set("#FC8A07", targetPlayer);
        viewModel.upgradeBorderColor.set("#D74F15", targetPlayer);
      } else {
        viewModel.upgradeTextColor.set("#FEEBE0", targetPlayer);
        viewModel.upgradeBGColor.set("#E4A151", targetPlayer);
        viewModel.upgradeBorderColor.set("#CC6A46", targetPlayer);
      }
    }
    else{
      if (value) {
        viewModel.upgradeTextColor.set("#ffffff", targetPlayer);
        viewModel.upgradeBGColor.set("#BC79FF", targetPlayer);
        viewModel.upgradeBorderColor.set("#853BD5", targetPlayer);
      } else {
        viewModel.upgradeTextColor.set("#D1C4E9", targetPlayer);
        viewModel.upgradeBGColor.set("#B39DDB", targetPlayer);
        viewModel.upgradeBorderColor.set("#978ea7", targetPlayer);
      }
    }
  }

  private setupRarityStar(viewModel: ShovelPanelRarityStarViewModel, isFilled: boolean, players: Array<Player>) {
    if (isFilled) {
      viewModel.isShown.set(true, players);
      viewModel.star.set(ImageSource.fromTextureAsset(this.props.shovelInventory_fullstar!), players);
      return;
    }
    if (SHOW_MISSING_STARS) {
      viewModel.isShown.set(true, players);
      viewModel.star.set(ImageSource.fromTextureAsset(this.props.shovelInventory_emptyStar!), players);
    } else {
      viewModel.isShown.set(false, players);
    }
  }

  private setupShovelCategory(viewModel: ShovelPanelCategoryViewModel, categoryId: string | null, players: Array<Player>) {
    if (categoryId === null) {
      viewModel.isShown.set(false, players);
      return;
    }
    viewModel.isShown.set(true, players);
    const categoryUIData = CategoryUIData.get(categoryId);
    viewModel.categoryName.set(categoryUIData.displayName, players);
    viewModel.bgColor.set(categoryUIData.color.toHex(), players);
  }

  createView(): UINode<any> {
    this.isOpenBinding = new Binding(false);
    this.isLeftArrowShown = new Binding(false);
    this.isRightArrowShown = new Binding(false);

    log.info("InitializeUI");
    this.setupShovelGridViewModels();
    const shovelTab = this.shovelTab();
    const shovelPanelGrid = this.shovelPanelGrid();
    const arrowGrid = this.arrowGrid();
    const shovelutionStatChangeView = UINode.if(this.shovelutionViewModel.isShown, this.shovelutionStatChangeView());
    const shovelInventoryView = Pressable({
      children: [
        View({ //HUD Mock
        children: [
          shovelTab,
          View({ //Shovel Inventory
            children: [
              View({ //Modal
              children: [
                shovelPanelGrid,
                arrowGrid
              ],
              style: {
                width: 1066,
                height: 489,
                flexShrink: 0
              }
            })],
            style: {
              display: "flex",
              width: 1066,
              height: 489,
              alignSelf: "center",
              flexDirection: "column",
              alignItems: "flex-start",
              flexShrink: 0,
              position: "absolute",
              top: 104
            }
          })],
        style: {
          width: "100%",
          height: "100%",
        }
      })],
      style: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
      },
      onClick: () => this.setOpen(false),
      propagateClick: false
    });

    const root = UINode.if(this.isOpenBinding, View({
      children: [
        shovelInventoryView,
        this.dimmerView(),
        shovelutionStatChangeView
      ],
      style: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
      },
    }))

    return root;
  }

  private shovelTab() {
    return View({ //Item Tab Group
      children: [
        View({ //button_ItemTab
          children: [
            View({ //BG Default
              children: [],
              style: {
                display: "flex",
                width: 138,
                height: 36,
                padding: 8,
                alignItems: "flex-start",
                flexShrink: 0,
                borderRadius: 12.8,
                backgroundColor: "#FFDD88",
                flexDirection: "row",
                position: "absolute",
                left: 0,
                top: 0
              }
            }),
            UI_Utils.outlinedText({ //Shovels
              text: "Shovels",
              style: {
                color: "#FFF",
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 25,
                fontWeight: "700"
              },
              outlineSize: OUTLINE_SIZE
            })
          ],
          style: {
            width: 138,
            height: 36,
            position: "absolute",
            right: 0,
            top: -2,
            borderRadius: 16
          }
        }),
        View({ //button_CurrencyTab
          children: [
            View({ //BG Default
              children: [],
              style: {
                display: "flex",
                width: 138,
                height: 36,
                padding: 8,
                alignItems: "flex-start",
                flexShrink: 0,
                borderRadius: 12.8,
                backgroundColor: "#E6E6FA",
                flexDirection: "row",
                position: "absolute",
                left: 0,
                top: 0
              }
            }),
            Image({ //img_gem
              source: ImageSource.fromTextureAsset(this.props.shovelInventory_gems!),
              style: {
                width: 24,
                height: 24,
              }
            }),
            UI_Utils.outlinedText({ //Currency
              text: this.gemsCountBinding,
              style: {
                color: "#FFF",
                textAlign: "center",
                fontFamily: "Roboto",
                fontSize: 25,
                fontWeight: "700"
              },
              outlineSize: OUTLINE_SIZE
            })
          ],
          style: {
            width: 138,
            height: 36,
            position: "absolute",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            right: 150, // Adjusted to position next to the Shovels tab
            top: -2,
            borderRadius: 16
          }
        })
      ],
      style: {
        display: "flex",
        width: 845,
        height: 36,
        justifyContent: "flex-end",
        alignItems: "flex-start",
        flexShrink: 0,
        flexDirection: "row",
        position: "absolute",
        left: 295,
        top: 68
      }
    });
  }

  private arrowGrid() {
    return View({ //Arrow Grid
      children: [
        UINode.if(this.isLeftArrowShown, Pressable({
        children: [
          Image({ //img_triangle_arrow
          source: ImageSource.fromTextureAsset(this.props.shovelInventory_arrow!),
          style: {
            width: 158,
            height: 158,
            position: "absolute",
            transform: [{ rotate: "180deg" }]
          }
        })],
        style: {
          width: 158,
          height: 158,
          left: -96,
          top: 128,
          position: "absolute",
        },
        onClick: () => this.pageBackward(),
        propagateClick: false
      })),
      UINode.if(this.isRightArrowShown, Pressable({
        children: [Image({ //img_triangle_arrow
          source: ImageSource.fromTextureAsset(this.props.shovelInventory_arrow!),
          style: {
            width: 158,
            height: 158,
            position: "absolute"
          }
        })],
        style: {
          width: 158,
          height: 158,
          left: 996,
          top: 128,
          position: "absolute",
        },
        onClick: () => this.pageForward(),
        propagateClick: false
      }))],
      style: {
        position: "absolute"
      }
    });
  }

  private shovelPanelGrid() {
    const children = new Array<UIChildren>;
    for (let i = 0; i < SHOVELS_DISPLAYED_PER_PAGE; ++i) {
      children.push(this.shovelPanel(this.shovelPanels[i]));
    }
    return View({ //Content
      children: [
        Pressable({
        children: [],
        style: {
          display: "flex",
          width: 1054,
          height: 486,
          padding: 4,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          flexShrink: 0,
          borderRadius: 16,
          backgroundColor: "#FFDD88",
          position: "absolute",
          left: 0,
          top: 0
        },
        onClick: () => { },
        propagateClick: false
      }),
      View({ //Shovel Panel Grid
        children: children,
        style: {
          display: "flex",
          width: 1066,
          height: 486,
          padding: 4,
          alignItems: "center",
          flexShrink: 0,
          flexDirection: "row",
          position: "absolute",
          left: -2,
          top: 0
        }
      })],
      style: {
        width: 1066,
        height: 486,
        flexShrink: 0,
        position: "absolute",
        left: 0,
        top: 0
      }
    });
  }

  private shovelPanel(viewModel: ShovelPanelViewModel) {
    let categoryRowTop = 149;     // determined from Figma values
    const children = new Array<UIChildren>;
    children.push(this.background(viewModel));

    for (let i = 0; i < CATEGORY_ROWS; ++i) {
      const offset = i * CATEGORIES_PER_ROW;
      children.push(this.categoryRowView(viewModel.categories.slice(offset, offset + CATEGORIES_PER_ROW), categoryRowTop));
      categoryRowTop += 25;      // determined from Figma values
    }

    children.push(this.equipButton(viewModel));
    children.push(this.shovelName(viewModel));
    children.push(this.statGrid(viewModel));
    children.push(this.shovelImage(viewModel));
    children.push(this.shovelDescription(viewModel));
    children.push(this.evolveInfo(viewModel));
    children.push(this.upgradeButton(viewModel));

    return UINode.if(viewModel.isShown, View({ //ShovelPanel
      children: children,
      style: {
        display: "flex",
        width: 334,
        height: 486,
        alignItems: "center",
        flexShrink: 0,
        flexDirection: "column",
        marginLeft: 13
      }
    }));
  }

  private statImageSpacing(index: number) {
    const STAT_IMAGE_TOP = 98;      // determined from Figma values
    const STAT_IMAGE_SPACING = 40;  // determined from Figma values
    return STAT_IMAGE_TOP + STAT_IMAGE_SPACING * index;
  }

  private background(viewModel: ShovelPanelViewModel) {
    return View({ //Shovel Item BG
      children: [],
      style: {
        display: "flex",
        width: 334,
        height: 466,
        alignSelf: "center",
        top: 10,
        flexDirection: "column",
        alignItems: "flex-start",
        flexShrink: 0,
        borderRadius: 16,
        borderWidth: 4,
        backgroundColor: viewModel.bgColor,
        borderColor: viewModel.borderColor
      }
    });
  }

  /*private statImage(statTextureAsset: Asset, top: number) {
    return View({ //PowerGrid
      children: [Image({ //img_boom
        source: ImageSource.fromTextureAsset(statTextureAsset),
        style: {
          width: 40,
          height: 40
        }
      })],
      style: {
        display: "flex",
        paddingVertical: 0,
        paddingHorizontal: 7,
        flexDirection: "column",
        alignItems: "center",
        position: "absolute",
        left: 8,
        top
      }
    });
  }*/

  private shovelImage(viewModel: ShovelPanelViewModel) {
    return View({ //Shovel Grid
      children: [Image({ //img_shovelUFO
        source: viewModel.shovelImage,
        style: {
          width: 178,
          height: 178,
        }
      })],
      style: {
        display: "flex",
        width: 168,
        height: 168,
        flexDirection: "column",
        alignItems: "center",
        position: "absolute",
        right: 0,
        top: 44
      }
    });
  }

  private evolveInfo(viewModel: ShovelPanelViewModel) {
    return UINode.if(viewModel.canEvolve, View({ //Evolve Group
      children: [
        Text({ // Evolves at 15
        text: viewModel.evolutionLevel.derive(x => 'Evolves at ' + x),
        style: {
          color: "#7B5B3D",
          fontFamily: "Roboto",
          textAlignVertical: "bottom",
          fontSize: 20,
          fontWeight: "700"
        }
      }),
      UINode.if(viewModel.showEvolutionStarIcon, Image({ //icn_star
        source: ImageSource.fromTextureAsset(this.props.shovelInventory_star!),
        style: {
          width: 20,
          height: 20,
          tintColor: "#5C3B1B",
          marginLeft: 2
        }
      }))],
      style: {
        display: "flex",
        width: "100%",
        height: 59,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        right: 0,
        bottom: 68,
        flexDirection: "row",
      }
    }));
  }

  private shovelDescription(viewModel: ShovelPanelViewModel) {
    return View({ //Description Grid
      children: [
        Text({ //Shovel Description
        text: viewModel.description.derive(x => "\"" + x + "\""),
        style: {
          width: 160,
          height: 170,
          flexShrink: 0,
          color: "#7B5B3D",
          textAlign: "center",
          textAlignVertical: "center",
          fontFamily: "Roboto",
          fontSize: 18,
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        width: 160,
        height: 170,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        left: 10,
        paddingHorizontal: 4,
        top: 64,
        flexDirection: "row"
      }
    });
  }

  private equipButton(viewModel: ShovelPanelViewModel) {
    return Pressable({ //Equip Grid
      children: [
        View({ //Equip BG
        children: [
          Text({
          text: viewModel.equipText,
          style: {
            width: "100%",
            height: "100%",
            color: viewModel.equipTextColor,
            textAlign: "center",
            textAlignVertical: "center",
            fontFamily: "Roboto",
            fontSize: 20,
            fontWeight: "700"
          }
        })],
        style: {
          display: "flex",
          width: "100%",
          height: 51,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "row",
          position: "absolute",
          borderRadius: 18,
          backgroundColor: viewModel.equipBGColor,
          borderColor: viewModel.equipBorderColor,
          borderBottomWidth: 4,
        }
      })],
      style: {
        position: "absolute",
        justifyContent: "center",
        alignItems: "center",
        left: 16,
        bottom: 23,
        width: "44%",
        height: 51,
      },
      onClick: (player) => this.onEquipSelected(player, viewModel.shovelId)
    });
  }

  private upgradeButton(viewModel: ShovelPanelViewModel) {
    return Pressable({
      // Upgrade Grid
      children: [
        View({
          // Upgrade BG
          children: [
            Text({
              text: viewModel.upgradeText,
              style: {
                width: "80%",
                height: "100%",
                color: viewModel.upgradeTextColor,
                textAlign: "center",
                textAlignVertical: "center",
                fontFamily: "Roboto",
                fontSize: 16,
                fontWeight: "700"
              }
            }),
          ],
          style: {
            display: "flex",
            width: "100%",
            height: 51,
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "row",
            position: "absolute",
            borderRadius: 18,
            backgroundColor: viewModel.upgradeBGColor,
            borderColor: viewModel.upgradeBorderColor,
            borderBottomWidth: 4,
            transform: [{ scale: viewModel.upgradeButtonScale }],
          },
        }),
        UINode.if(viewModel.canUpgrade, View({
          children: [
            Image({
              source: ImageSource.fromTextureAsset(this.props.icn_arrowLevelUp!),
              style: {
                top: 3,
                width: 16,
                height: 16,
                flexShrink: 0,
                alignSelf: "center",
              },
            }),
          ],
          style: {
            backgroundColor: "red",
            borderRadius: 12,
            borderColor: "red",
            width: 24,
            height: 24,
            position: "absolute",
            top: -8,
            right: -8,
          },
        })),
        UINode.if(viewModel.upgradeStarVisible, Image({
          source: ImageSource.fromTextureAsset(this.props.shovelInventory_fullstar!),
          style: {
            width: 50,
            height: 50,
            position: "absolute",
            transform: [
              {translateX: this.upgradeStarX.interpolate([0, 1], [0, -60])},
              {translateY: this.upgradeStarY.interpolate([0, 1], [0, -362])},
              {scale: this.upgradeStarScale.interpolate([0, 0.5, 1], [0.25, 2, 0.6]),}
            ]
          }
        }))
      ],
      style: {
        position: "absolute",
        justifyContent: "center",
        alignItems: "center",
        right: 16,
        bottom: 23,
        width: "44%",
        height: 51,
        zIndex: 1,
      },
      onClick: (player) => this.onUpgradeSelected(player, viewModel, viewModel.shovelId),
      disabled: viewModel.canUpgrade.derive(x => !x)
    });
  }

  private shovelName(viewModel: ShovelPanelViewModel) {
    return View({
      children: [
        Text({ //Shovel Name
          text: viewModel.displayName,
          style: {
            color: "#5C3B1B",
            textAlign: "center",
            textAlignVertical: "center",
            fontFamily: "Roboto",
            fontSize: 24,
            fontWeight: "700"
          }
        }),
        View({ //Horizontal level star group
          children: [
            Text({ //Shovel Level
              text: viewModel.level,
              style: {
                color: "#5C3B1B",
                textAlign: "center",
                textAlignVertical: "center",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "900"
              },
            }),
            Image({ //shovelInventory_fullstar
              source: ImageSource.fromTextureAsset(this.props.shovelInventory_star!),
              style: {
                width: 20,
                height: 20,
                resizeMode: "cover",
                tintColor: "#5C3B1B"
              }
            })],
          style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "row",
            paddingHorizontal: 8,
            borderRadius: 10,
            backgroundColor: "#AEC6A9",
            transform: [{ scale: viewModel.upgradeStarButtonScale }],
          }
        }),
      ],
      style: {
        width: "100%",
        position: "absolute",
        left: 0,
        top: 20,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center"
      }
    });
  }

  private statGrid(viewModel: ShovelPanelViewModel) {
    return View({ //Shovel Identity Widget
          children: [
            Image({ //Icon Identity
              source: viewModel.abilityIcon,
              style: {
                width: 42,
                height: 42,
                borderRadius: 8
              }
            }),
            Text({ // ability text
              text: viewModel.abilityText,
              style: {
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                marginLeft: 4,
                textAlign: "left",
                textAlignVertical: "center",
                color: "#573615",
                fontFamily: "Roboto",
                fontSize: 20,
                fontWeight: "700"
              }
            })],
          style: {
            display: "flex",
            padding: 8,
            alignItems: "center",
            width: "90%",
            borderRadius: 16,
            backgroundColor: "#FFDC83",
            position: "absolute",
            flexDirection: "row",
            top: 230
          }
        });
  }

  private categoryRowView(viewModels: Array<ShovelPanelCategoryViewModel>, bottom: number) {
    const children = new Array<UIChildren>;
    for (let i = 0; i < CATEGORIES_PER_ROW; ++i) {
      children.push(this.categoryView(viewModels[i]));
    }
    return View({ //Category Grid
      children: children,
      style: {
        display: "flex",
        width: "100%",
        height: 30,
        justifyContent: "center",
        alignItems: "flex-start",
        position: "absolute",
        left: 4,
        bottom: 120,
        flexDirection: "row"
      }
    });
  }

  private categoryView(viewModel: ShovelPanelCategoryViewModel) {
    return UINode.if(viewModel.isShown, View({ //Category Stat
      children: [View({ //BG Inner
        children: [UI_Utils.outlinedText({ //Category Stat Text
          text: viewModel.categoryName,
          style: {
            color: "#FFF",
            textAlign: "center",
            textAlignVertical: "center",
            fontFamily: "Roboto",
            fontSize: 20,
            fontWeight: "700"
          },
          outlineSize: OUTLINE_SIZE
        })],
        style: {
          display: "flex",
          paddingVertical: 0,
          paddingHorizontal: 20,
          height: 24,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 18,
          backgroundColor: viewModel.bgColor,
          flexDirection: "row"
        }
      })],
      style: {
        display: "flex",
        padding: 2,
        flexDirection: "column",
        alignItems: "flex-start",
        borderRadius: 18,
        backgroundColor: "#B7B7B7"
      }
    }));
  }

  private shovelutionStatChangeView() {
    const root = View({ //UI Shovelution Stat Change
      children: [ View({ //Modal
          children: [ View({ //BG
              children: [  ],
              style: {
                  display: "flex",
                  paddingVertical: 0,
                  paddingHorizontal: 8,
                  flexDirection: "column",
                  alignItems: "center",
                  flexGrow: 1,
                  flexShrink: 0,
                  flexBasis: 0,
                  alignSelf: "stretch",
                  borderRadius: 30,
                  borderWidth: 4,
                  borderColor: "#FECA47",
                  backgroundColor: "#FFF1C1"
              }
          }),
          View({ //Contents
              children: [ View({ //Title
                  children: [ Text({ // Congrats! Trusty Shovel Evolved!
                      text: this.shovelutionViewModel.titleText,
                      style: {
                          color: "#6E2F0E",
                          textAlign: "center",
                          fontFamily: "Roboto",
                          fontSize: 24,
                          fontWeight: "700"
                      }
                  }) ],
                  style: {
                      display: "flex",
                      paddingVertical: 4,
                      paddingHorizontal: 36,
                      justifyContent: "center",
                      alignItems: "center",
                      position: "absolute",
                      left: 62,
                      top: -17,
                      borderRadius: 30,
                      backgroundColor: "#FECA47",
                      flexDirection: "row"
                  }
              }),
              View({ //Star Group
                  children: [ View({ //Star 1
                      children: [ Text({ // 3
                          text: this.shovelutionViewModel.prevLevelStarText,
                          style: {
                              color: "#5A3715",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 24,
                              fontWeight: "900"
                          }
                      }),
                      Image({ //shovelInventory_fullstar
                          source: ImageSource.fromTextureAsset(this.props.shovelInventory_fullstar!),

                          style: {
                              width: 28,
                              height: 28,
                              tintColor: "#5C3B1B"
                          }
                      }) ],
                      style: {
                          display: "flex",
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 7,
                          backgroundColor: "#C3BA97",
                          flexDirection: "row"
                      }
                  }),
                  View({ //Star 2
                      children: [ Text({ // 4
                          text: this.shovelutionViewModel.newLevelStarText,
                          style: {
                              color: "#5A3715",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 24,
                              fontWeight: "900"
                          }
                      }),
                      Image({ //shovelInventory_fullstar
                          source: ImageSource.fromTextureAsset(this.props.shovelInventory_fullstar!),

                          style: {
                              width: 28,
                              height: 28,
                              tintColor: "#5C3B1B"
                          }
                      }) ],
                      style: {
                          display: "flex",
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 7,
                          backgroundColor: "#C3BA97",
                          marginLeft: 240,
                          flexDirection: "row"
                      }
                  }) ],
                  style: {
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      alignSelf: "stretch",
                      flexDirection: "row"
                  }
              }),
              View({ //Horizontal Group
                  children: [ View({ //Ability Group 1
                      children: [ Image({ //icn_ability
                          source: this.shovelutionViewModel.prevAbilityIcon,

                          style: {
                              width: 54,
                              height: 54,
                              borderRadius: 8
                          }
                      }),
                      View({ //Spacer
                          style: {
                              width: 8,
                              height: 8
                          }
                      }),
                      Text({ // Stat text 1
                          text: this.shovelutionViewModel.prevStatText,
                          style: {
                              color: "#573615",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 28,
                              fontWeight: "900"
                          }
                      }),
                      Text({ // chance to get 2x Gems for Streaks and Repeat Digs
                          text: this.shovelutionViewModel.prevStatDescriptionText,
                          style: {
                              width: 188,
                              color: "#573615",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 20,
                              fontWeight: "700"
                          }
                      }) ],
                      style: {
                          display: "flex",
                          width: 203,
                          padding: 8,
                          flexDirection: "column",
                          alignItems: "center",
                          borderRadius: 16,
                          backgroundColor: "#FFDC83"
                      }
                  }),
                  View({ //Center Arrows
                      children: [
                        Image({ //icn_arrowRight
                          source: ImageSource.fromTextureAsset(this.props.icn_arrowRight!),

                          style: {
                              width: 24,
                              height: 24,
                              tintColor: "#5C3B1B"
                          }
                      }),
                      Image({ //icn_arrowRight
                          source: ImageSource.fromTextureAsset(this.props.icn_arrowRight!),

                          style: {
                              width: 24,
                              height: 24,
                              tintColor: "#5C3B1B"
                          }
                      }) ],
                      style: {
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          alignSelf: "stretch",
                          marginLeft: 24,
                          flexDirection: "row"
                      }
                  }),
                  View({ //Ability Group 2
                      children: [ Image({ //icn_ability
                          source: this.shovelutionViewModel.newAbilityIcon,

                          style: {
                              width: 54,
                              height: 54,
                              borderRadius: 8
                          }
                      }),
                      View({ //Spacer
                          style: {
                              width: 8,
                              height: 8
                          }
                      }),
                      Text({ // Stat text 2
                          text: this.shovelutionViewModel.newStatText,
                          style: {
                              color: "#573615",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 28,
                              fontWeight: "900"
                          }
                      }),
                      Text({ // chance to get 2x Gems for Streaks and Repeat Digs
                          text: this.shovelutionViewModel.newStatDescriptionText,
                          style: {
                              width: 188,
                              color: "#573615",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 20,
                              fontWeight: "700"
                          }
                      }) ],
                      style: {
                          display: "flex",
                          width: 203,
                          padding: 8,
                          flexDirection: "column",
                          alignItems: "center",
                          borderRadius: 16,
                          backgroundColor: "#FFDC83",
                          marginLeft: 24
                      }
                  }) ],
                  style: {
                      display: "flex",
                      paddingVertical: 16,
                      paddingHorizontal: 0,
                      alignItems: "flex-start",
                      alignSelf: "stretch",
                      flexDirection: "row"
                  }
              }),
              View({ //Btn Group
                  children: [ Pressable({ //button_nice
                      children: [ Text({ // Nice!
                          text: "Nice!",
                          style: {
                              color: "#FFF",
                              textAlign: "center",
                              fontFamily: "Roboto",
                              fontSize: 24,
                              fontWeight: "700"
                          }
                      }) ],
                      style: {
                          display: "flex",
                          paddingVertical: 10,
                          paddingHorizontal: 87,
                          justifyContent: "center",
                          alignItems: "center",
                          borderRadius: 15,
                          borderBottomWidth: 4,
                          borderColor: "#49A24C",
                          backgroundColor: "#70C04E",
                          flexDirection: "row"
                      },
                      onClick: () => this.onClickShovelutionButton(),
                  }) ],
                  style: {
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      alignSelf: "stretch",
                      flexDirection: "row"
                  }
              }) ],
              style: {
                  display: "flex",
                  width: 550,
                  paddingTop: 36,
                  paddingRight: 24,
                  paddingBottom: 16,
                  paddingLeft: 24,
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                  marginLeft: -550
              }
          }) ],
          style: {
              display: "flex",
              width: 550,
              alignItems: "flex-start",
              flexShrink: 0,
              flexDirection: "row"
          }
      }) ],
      style: {
          display: "flex",
          width: 1342,
          height: 620,
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0,
          flexDirection: "row",
          position: "absolute",
      }
    })
    return root;
  }

  dimmerView() {
    const bg = View({
      style:{
        width: '101%',
        height: '101%',
        backgroundColor: '#000000',
        opacity: this.bgOpacity,
        position: 'absolute',
      }
    })

    return bg;
  }

  /*private rarityStars(rarityStars: ShovelPanelRarityStarViewModel[]) {
    const children = new Array<UIChildren>;
    for (let i = 0; i < MAX_RARITY_STARS; ++i) {
      const star = rarityStars[i];
      children.push(UINode.if(star.isShown,
        Image({ //img_star
          source: rarityStars[i].star,
          style: {
            width: 16,
            height: 16,
          }
        })
      ));
    }
    return View({ //StarRarityGrid
      children,
      style: {
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        left: 90,
        top: 60,
        flexDirection: "row",
        width: 100
      }
    });
  } */
}

class ShovelPanelViewModel {
  shovelId = "";
  isShown = new Binding(false);
  canUpgrade = new Binding(false);
  displayName = new Binding("");
  level = new Binding('');
  description = new Binding("");
  evolutionLevel = new Binding("");
  canEvolve = new Binding(false);
  showEvolutionStarIcon = new Binding(false);
  abilityText = new Binding("");
  abilityIcon: Binding<ImageSource>
  rarityStars = new Array<ShovelPanelRarityStarViewModel>;
  categories = new Array<ShovelPanelCategoryViewModel>;
  shovelImage!: Binding<ImageSource>;
  equipText = new Binding("");
  equipTextColor = new Binding("#FFFFFF");
  equipBGColor = new Binding("#FFFFFF");
  equipBorderColor = new Binding("#FFFFFF");
  upgradeText = new Binding("");
  upgradeTextColor = new Binding("#FFFFFF");
  upgradeBGColor = new Binding("#FFFFFF");
  upgradeBorderColor = new Binding("#FFFFFF");
  upgradeButtonScale = new AnimatedBinding(1);
  borderColor = new Binding("#FFFFFF");
  bgColor = new Binding("#FFFFFF");
  upgradeStarVisible = new Binding(false);
  upgradeStarButtonScale = new AnimatedBinding(1);

  constructor(shovelImage: ImageSource) {
    this.shovelImage = new Binding(shovelImage);
    this.abilityIcon = new Binding<ImageSource>(ImageSource.fromTextureAsset(new Asset(BigInt(1304161181004610), BigInt(0))));
  }
}

class ShovelPanelCategoryViewModel {
  isShown = new Binding(false);
  bgColor = new Binding("#000000");
  categoryName = new Binding("");
}

class ShovelPanelRarityStarViewModel {
  isShown = new Binding(false);
  star!: Binding<ImageSource>;

  constructor(star: ImageSource) {
    this.star = new Binding(star);
  }
}

class ShovelutionStatChangeViewModel {
  isShown = new Binding(false);
  prevAbilityIcon: Binding<ImageSource>;
  newAbilityIcon: Binding<ImageSource>;
  titleText = new Binding("");
  prevLevelStarText = new Binding("");
  newLevelStarText = new Binding("");
  prevStatText = new Binding("");
  newStatText = new Binding("");
  prevStatDescriptionText = new Binding("");
  newStatDescriptionText = new Binding("");


  constructor() {
    this.prevAbilityIcon = new Binding<ImageSource>(ImageSource.fromTextureAsset(new Asset(BigInt(1304161181004610), BigInt(0))));
    this.newAbilityIcon = new Binding<ImageSource>(ImageSource.fromTextureAsset(new Asset(BigInt(1304161181004610), BigInt(0))));
  }
}
