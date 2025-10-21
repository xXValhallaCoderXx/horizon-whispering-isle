/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { CategoryUIData } from 'CategoryUIData';
import { allHudElementTypes, HUDElementType } from 'Enums';
import { Events } from 'Events';
import { LocalEvent, NetworkEvent, Player } from 'horizon/core';
import { AnimatedBinding, Bindable, Binding, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { HUDAnimations } from 'HUDAnimations';
import { AnimatedHUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { ItemContainer } from 'ItemContainer';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { SelectedPotionData } from 'PlayerData';
import { PlayerDataEvents } from 'PlayerDataEvents';
import { PotionInventoryData } from 'PlayerInventoryData';
import { PotionBuffType, PotionData, PotionTuning } from 'PotionData';
import { Shovel } from 'Shovel';
import { ShovelData } from 'ShovelData';
import { missing_texture, UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlocking2Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking2 } from 'UIRoot_InteractionNonBlocking2';

const MAX_ITEMS_PER_ROW = 8;
const MAX_ROWS = 3;
const MAX_ITEMS = MAX_ITEMS_PER_ROW * MAX_ROWS;
const ITEM_WIDTH = 87;
const POPUP_OFFSET_X = -38;
const POPUP_OFFSET_Y = -74;

const CLICK_COOLDOWN = 500;

const MAX_CATEGORIES = 1;
const RED_COLOR = "#FF4C3F";

const log = new Logger("UI_PotionInventory");

export type PotionSlotData = {
  potionId: string,
  index: number,
  count: number,
  selected?: boolean,
  isLocked?: boolean
}

export class UIView_PotionInventory extends UIView_InteractionNonBlocking2Base {
  private viewModel!: InventoryViewModel;
  private isExpanded: boolean = false;
  private isAnimating: boolean = false;
  private isShovelEquipped: boolean = false;
  private hasRecentClick: boolean = false;
  private isPopupShowing: boolean = false;
  private hudElementVisible!: AnimatedHUDElementVisibilityTracker;

  private shovelData: ShovelData | undefined;
  private selectedIndex: number = -1;
  private equippedIndex: number = -1;
  private expandedItemCount = 0;
  private slots = new Array<PotionSlotData | undefined>(MAX_ITEMS).fill(undefined);
  private inventorySize = MAX_ITEMS; // We will get from the server the real inventory size

  public static onSlotEquipSelected = new NetworkEvent<{ owner: Player, index: number, selected: boolean }>("sendPotionSlotSelected")
  public static potionInventoryUpdated = new NetworkEvent<{ player: Player, potionInventory: PotionInventoryData[] }>("potionInventoryUpdated")
  public static requestTogglePotionInventory = new LocalEvent("requestTogglePotionInventory")

  private selectedPotionIds = new Set<string>(); // cache of active potions

  private potionPopup!: PotionPopup;

  constructor(uiRoot: UIRoot_InteractionNonBlocking2) {
    super(uiRoot);
    const isLocalPlayer = this.localPlayer !== this.serverPlayer;
    if (!isLocalPlayer) {
      return;
    }

    this.viewModel = new InventoryViewModel(MAX_ROWS, MAX_ITEMS_PER_ROW, missing_texture.getImage());
    this.hudElementVisible = new AnimatedHUDElementVisibilityTracker(HUDElementType.PotionInventory, HUDAnimations.inventoryHideAnimation);


    this.potionPopup = new PotionPopup(this.localPlayer, missing_texture.getImage(), (use: boolean) => {
      if (use) {
        this.equip(this.selectedIndex);
      }
      else {
        this.hideItemPopupAfterDelay();
      }
    });

    this.uiRoot.connectNetworkBroadcastEvent(UIView_PotionInventory.potionInventoryUpdated, data => this.onPotionInventoryUpdated(data.potionInventory));

    this.uiRoot.connectNetworkBroadcastEvent(PlayerDataEvents.updateSelectedPotions, (data) => this.updateSelectedPotions(data.selectedPotionsData));
    this.uiRoot.sendNetworkBroadcastEvent(PlayerDataEvents.requestSelectedPotions, { player: this.localPlayer }, [this.serverPlayer]);

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (payload) => {
      log.info("received this.localPlayerShovelChanged event shoveldata " + payload.shovelData);
      this.shovelData = payload.shovelData;
      this.onShovelDataUpdate();
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.localSetShovelLevel, () => {
      this.setShovelLevel();
    })

    this.uiRoot.connectLocalBroadcastEvent(UIView_PotionInventory.requestTogglePotionInventory, () => {
      this.setExpanded(!this.isExpanded);
    })

    this.hudElementVisible.connect(this.uiRoot);
    for (let i = 0; i < MAX_ITEMS; i++) {
      this.updateBackground(i);
    }

    if (ItemContainer.localInstance?.isDataLoaded()) {
      this.uiRoot.sendNetworkBroadcastEvent(Events.requestInventory, { player: this.localPlayer }, [this.serverPlayer]);
    }
    else {
      const sub = this.uiRoot.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, payload => {
        this.uiRoot.sendNetworkBroadcastEvent(Events.requestInventory, { player: this.localPlayer }, [this.serverPlayer]);
        sub.disconnect();
      })
    }
    // TODO - make this something not time based, this is awful
    this.requestInventoryAfterWait(10000);
  }

  private async requestInventoryAfterWait(ms: number) {
    log.info("requestInventoryAfterWait")
    await new Promise(resolve => {
      this.uiRoot.async.setTimeout(() => resolve(true), ms);
    });
    log.info("requestInventoryAfterWait - done waiting")
    this.uiRoot.sendNetworkBroadcastEvent(Events.requestInventory, { player: this.localPlayer });
  }

  private onPotionInventoryUpdated(potionInventory: PotionInventoryData[]) {
    for (let i = 0; i < this.viewModel.items.length; i++) {
      let itemViewModel = this.viewModel.items[i];
      if (i >= potionInventory.length) {
        // Empty
        itemViewModel.hasItem.set(false, [this.localPlayer]);
        this.slots[i] = undefined;
        itemViewModel.potionId = "";
      }
      else {
        let potionInventoryData = potionInventory[i];
        itemViewModel.hasItem.set(true, [this.localPlayer]);
        itemViewModel.itemImage.set(this.getPotionImage(potionInventoryData.id), [this.localPlayer]);
        itemViewModel.weightText.set(`x${potionInventoryData.count}`, [this.localPlayer]);
        let potionSlotData: PotionSlotData = {
          potionId: potionInventoryData.id,
          index: i,
          count: potionInventoryData.count,
        }
        this.slots[i] = potionSlotData;
        itemViewModel.potionId = potionInventoryData.id;
        itemViewModel.isActive.set(this.selectedPotionIds.has(itemViewModel.potionId), [this.localPlayer]);
      }
    }
  }

  private updateSelectedPotions(selectedPotions: SelectedPotionData[]) {
    this.selectedPotionIds = new Set(selectedPotions.map(potion => potion.id));

    for (let i = 0; i < this.viewModel.items.length; i++) {
      let itemViewModel = this.viewModel.items[i];
      itemViewModel.isActive.set(this.selectedPotionIds.has(itemViewModel.potionId), [this.localPlayer]);
    }
  }

  private incrementExpandedItemCount() {
    this.expandedItemCount++;
    this.updateExpandedItemCountText();
  }

  private decrementExpandedItemCount() {
    this.expandedItemCount--;
    this.updateExpandedItemCountText();
  }

  private updateExpandedItemCountText() {
    const text = this.expandedItemCount > 0 ? "+" + this.expandedItemCount : " ";
    this.viewModel.expandedInventoryCountText.set(text, [this.localPlayer]);
  }

  private onSlotClicked(index: number) {
    // Need to wait a frame to ensure popup buttons are handled first.
    this.uiRoot.async.setTimeout(() => {
      if (!this.isExpanded) {
        // For potion inventory, we only want to handle clicks when the inventory is expanded
        // since it's only visible when expanded.
        return;
      }
      if (this.isAnimating || this.hasRecentClick) {
        return;
      }
      if (index >= MAX_ITEMS_PER_ROW && !this.isExpanded) {
        return;
      }
      log.info(`OnSlotClicked (${index})`);
      if (this.isExpanded) {
        this.showItemPopup(index);
      } else {
        this.equip(index);
      }
    }, 30);
  }

  private showItemPopup(index: number) {
    const slotData = this.slots[index];
    if (slotData === undefined) {
      this.hideItemPopup();
      return;
    }
    this.click();
    this.unselectCurrentSelection();
    this.selectedIndex = index;
    this.updateBackground(index);
    this.isPopupShowing = true;

    // Reset to not show - we will show it if needed
    this.viewModel.popup.isShowing.set(false, [this.localPlayer]);
    this.potionPopup.setVisible(false);

    if (this.slots[index] !== undefined) {
      let potionId = this.slots[index]!.potionId;

      if (this.selectedPotionIds.has(potionId)) {
        this.viewModel.popup.isShowing.set(true, [this.localPlayer]);
        const x = this.getInventoryItemX(index);
        const y = this.getInventoryItemY(index);
        this.viewModel.popup.x.set(x, [this.localPlayer]);
        this.viewModel.popup.y.set(y, [this.localPlayer]);

        if (slotData.isLocked) {
          this.viewModel.popup.pinBG.set("#F05F69", [this.localPlayer]);
          this.viewModel.popup.pinBottom.set("#883643", [this.localPlayer]);
          this.viewModel.popup.pinText.set("Unlock", [this.localPlayer]);
          this.viewModel.popup.pinImage.set(ImageSource.fromTextureAsset(this.props.inventory_unpin!), [this.localPlayer]);
        } else {
          this.viewModel.popup.pinBG.set("#56B2FF", [this.localPlayer]);
          this.viewModel.popup.pinBottom.set("#415369", [this.localPlayer]);
          this.viewModel.popup.pinText.set("Lock", [this.localPlayer]);
          this.viewModel.popup.pinImage.set(ImageSource.fromTextureAsset(this.props.inventory_pin!), [this.localPlayer]);
        }
      }
      else {
        this.potionPopup.setup(slotData.potionId);
        this.potionPopup.setVisible(true);
      }
    }

    const context = "potion_popup";
    this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context, exclude: allHudElementTypes & ~(HUDElementType.Location) });
  }

  private unselectCurrentSelection() {
    const index = this.selectedIndex;
    if (index < 0) {
      return;
    }
    this.selectedIndex = -1;
    this.updateBackground(index);
  }

  private updateBackground(index: number) {
    const itemViewModel = this.viewModel.items[index];
    if (index === this.selectedIndex) {
      // Selected
      itemViewModel.background.set("#56B2FF", [this.localPlayer]);
      itemViewModel.backgroundOpacity.set(.6, [this.localPlayer]);
      return;
    }
    if (index === this.equippedIndex) {
      itemViewModel.background.set("#56B2FF", [this.localPlayer]);
      itemViewModel.backgroundOpacity.set(.6, [this.localPlayer]);
      return;
    }
    const data = this.slots[index];
    if (data === undefined || !data.isLocked) {
      // Unpinned/Empty
      itemViewModel.background.set("#000000", [this.localPlayer]);
      itemViewModel.backgroundOpacity.set(0.67, [this.localPlayer]);
      return;
    }
    // Pinned
    itemViewModel.background.set("#000000", [this.localPlayer]);
    itemViewModel.backgroundOpacity.set(0.9, [this.localPlayer]);
  }

  private hideItemPopupAfterDelay() {
    // This is a hack to prevent the popup from closing before handling button clicks on the popup.
    // The order of execution seems unpredictable, so we delay the close a couple of frames to ensure the
    // button press is handled first.
    this.uiRoot.async.setTimeout(() => this.hideItemPopup(), 60);
  }

  private hideItemPopup() {
    if (!this.isPopupShowing || this.hasRecentClick) {
      return;
    }
    this.isPopupShowing = false;
    this.viewModel.popup.isShowing.set(false, [this.localPlayer]);
    this.potionPopup.setVisible(false);
    this.unselectCurrentSelection();
    const context = "potion_popup";
    this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context, exclude: allHudElementTypes & ~(HUDElementType.Location) });
  }

  private getInventoryItemX(index: number): number {
    return index % MAX_ITEMS_PER_ROW * ITEM_WIDTH + POPUP_OFFSET_X;
  }

  private getInventoryItemY(index: number): number {
    return Math.floor(index / MAX_ITEMS_PER_ROW) * ITEM_WIDTH + POPUP_OFFSET_Y;
  }

  private equip(index: number) {
    this.hideItemPopup();
    this.click();

    // TODO: move to different spot?
    if (this.slots[index] !== undefined) {
      let potionId = this.slots[index]!.potionId;

      this.uiRoot.sendNetworkBroadcastEvent(Events.requestSelectPotion, { player: this.localPlayer, potionId: potionId });

      // if (this.selectedPotionIds.has(potionId)) {
      //   this.uiRoot.sendNetworkBroadcastEvent(Events.requestUnselectPotion, { player: this.localPlayer, potionId: potionId });
      // }
      // else {
      //   this.uiRoot.sendNetworkBroadcastEvent(Events.requestSelectPotion, { player: this.localPlayer, potionId: potionId });
      // }
    }

    this.setShovelEquipped(false);
    if (index === this.equippedIndex) { // reclicked current index
      index = -1;
    }
    this.unequipCurrentEquipment();
    if (index < 0) {
      return;
    }
    this.equippedIndex = index;
    this.updateBackground(index);
    log.info(`sending onSlotEquipSelected event-  index - ${index}  selected - true`);
    this.uiRoot.sendNetworkEvent(this.uiRoot.entity, UIView_PotionInventory.onSlotEquipSelected, {
      owner: this.localPlayer,
      index: index,
      selected: true
    });
  }

  private unequip(index: number) {
    let potionId = this.slots[index]!.potionId;
    this.uiRoot.sendNetworkBroadcastEvent(Events.requestUnselectPotion, { player: this.localPlayer, potionId: potionId });
    this.unselectCurrentSelection();
  }

  private unequipCurrentEquipment() {
    if (this.equippedIndex < 0) {
      return;
    }
    const index = this.equippedIndex;
    this.equippedIndex = -1;
    this.updateBackground(index);
    log.info(`sending onSlotEquipSelected event-  index - ${index}  selected - false`);
    this.uiRoot.sendNetworkEvent(this.uiRoot.entity, UIView_PotionInventory.onSlotEquipSelected, {
      owner: this.localPlayer,
      index: index,
      selected: false,
    });
  }

  private toggleItemPin(index: number): void {
    const slotData = this.slots[index];
    if (slotData === undefined) {
      log.warn(`Tried to toggle pin for an empty slot - ${index}`);
      return;
    }
    this.hideItemPopup();
    this.click();
    this.uiRoot.sendNetworkBroadcastEvent(BigBox_Player_Inventory.lockItem, {
      player: this.localPlayer,
      itemIndex: index,
      isLocked: !slotData.isLocked
    }, [this.serverPlayer]);
  }

  private onShovelDataUpdate() {
    if (this.shovelData === undefined) {
      return;
    }
    let textureAsset = this.shovelData.getIconAsset()!;
    let imageSource: ImageSource | undefined = undefined;
    if (textureAsset === undefined) {
      log.error("Shovel icon texture is not defined");
      imageSource = missing_texture.getImage();
    } else {
      imageSource = ImageSource.fromTextureAsset(textureAsset);
    }
    this.viewModel.equippedShovelImage.set(imageSource, [this.localPlayer]);
    this.setShovelLevel();
  }

  private setShovelLevel() {
    if (this.shovelData === undefined) {
      return;
    }

    this.viewModel.shovelLevel.set(`Lv. ${Shovel.getLevel(this.shovelData.id) + 1}`, [this.localPlayer]);
  }

  private onShovelEquipPressed() {
    if (this.hasRecentClick) {
      return;
    }
    this.click();
    this.setShovelEquipped(!this.isShovelEquipped);
  }

  private setShovelEquipped(isEquipped: boolean) {
    if (this.isShovelEquipped === isEquipped) {
      return;
    }
    this.isShovelEquipped = isEquipped;
    this.viewModel.isShovelEquipped.set(this.isShovelEquipped, [this.localPlayer]);
    this.uiRoot.sendNetworkBroadcastEvent(this.isShovelEquipped ? Shovel.equip : Shovel.unequip, this.localPlayer, [this.localPlayer, this.serverPlayer]);
    if (this.isShovelEquipped) {
      this.unequipCurrentEquipment()
    }
  }

  private onInventorySizeUpdated(size: number) {
    this.inventorySize = size;
    for (let i = 0; i < this.viewModel.items.length; i++) {
      this.viewModel.items[i].isPastCapacity.set(i >= size, [this.localPlayer]);
    }
  }

  private click() {
    this.hasRecentClick = true;
    this.uiRoot.async.setTimeout(() => this.hasRecentClick = false, CLICK_COOLDOWN);
  }

  private setExpanded(isExpanded: boolean) {
    if (this.isExpanded === isExpanded || this.isAnimating) {
      return;
    }
    const context = "inventory_expand";
    this.isExpanded = isExpanded;
    this.isAnimating = true;
    this.viewModel.isClickable.set(false, [this.localPlayer]);
    this.viewModel.expandedScale.set(HUDAnimations.iventoryExpandAnimation(this.isExpanded), () => {
      this.isAnimating = false;
      this.viewModel.isClickable.set(true, [this.localPlayer]);
      if (!this.isExpanded) {
        this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context, exclude: allHudElementTypes & ~(HUDElementType.Inventory | HUDElementType.AboveInventory) });
      }
    }, [this.localPlayer]);
    if (!this.isExpanded) {
      this.hideItemPopup();
    }
    else {
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context, exclude: allHudElementTypes & ~(HUDElementType.Inventory | HUDElementType.AboveInventory) });
    }
    this.click();
  }

  private getPotionImage(potionId: string): ImageSource {
    return PotionData.getPotionImage(potionId) ?? missing_texture.getImage();
  }

  private shovelEquipButton(): UINode {
    return View({ //button_ShovelEquip
      children: [
        UINode.if(this.hudElementVisible.isActive(),
          UINode.if(this.viewModel.isClickable,
            Pressable({
              style: {
                width: 84,
                height: 84,
                position: "absolute",
              },
              onClick: () => this.onShovelEquipPressed()
            }))),
        View({ //Shovel Level WIdget
          children: [Text({ // Lv. 8998
            text: this.viewModel.shovelLevel,
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flexGrow: 1,
              flexShrink: 0,
              flexBasis: 0,
              alignSelf: "stretch",
              color: "#573615",
              textAlign: "center",
              textAlignVertical: "center",
              fontFamily: "Roboto",
              fontSize: 20,
              fontWeight: "700"
            }
          })],
          style: {
            display: "flex",
            width: 84,
            height: 30,
            justifyContent: "center",
            alignItems: "center",
            flexShrink: 0,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            borderBottomWidth: 2,
            borderColor: "#945F12",
            backgroundColor: "#FFDC83",
            flexDirection: "row",
            position: "absolute",
            left: 0,
            top: -30
          }
        }),
        View({ //BG Unequipped
          style: {
            width: 84,
            height: 84,
            flexShrink: 0,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            borderBottomWidth: 4,
            backgroundColor: this.viewModel.isShovelEquipped.derive(isEquipped => isEquipped ? "#808284" : "#808284"),
            position: "absolute",
            left: 0,
            top: 0,
            borderColor: this.viewModel.isShovelEquipped.derive(isEquipped => isEquipped ? "#945F12" : "#415369")
          }
        }),
        Image({ //icn_NewestShovel
          source: this.viewModel.equippedShovelImage,
          style: {
            width: 80,
            height: 80,
            flexShrink: 0,
            resizeMode: "cover",
            position: "absolute",
            left: 2,
            top: 0
          }
        }),
      ],
      style: {
        width: 84,
        height: 84,
        flexShrink: 0,
        position: "absolute",
        left: 1056,
        top: 509
      }
    });
  }

  private inventoryExpandButton(): UINode {
    return View({
      children: [Image({ //icn_arrowUp
        source: ImageSource.fromTextureAsset(this.props.inventory_arrowUp!),
        style: {
          width: 20,
          height: 20,
        }
      }),
      Text({ // +29
        text: this.viewModel.expandedInventoryCountText,
        style: {
          left: -1,
          width: 44,
          height: 20,
          alignSelf: "stretch",
          color: "#FFF",
          textAlign: "center",
          fontFamily: "Roboto",
          fontSize: 16,
          fontWeight: "700"
        }
      }),
      Image({ //icn_backpack
        source: ImageSource.fromTextureAsset(this.props.inventory_backpack!),
        style: {
          width: 32,
          height: 32,
          resizeMode: "cover"
        }
      }),
      UINode.if(this.hudElementVisible.isActive(),
        UINode.if(this.viewModel.isClickable,
          Pressable({ //button_inventoryExpand
            style: {
              width: 44,
              height: 84,
              position: "absolute",
            },
            onClick: () => this.setExpanded(true)
          })))],
      style: {
        width: 44,
        height: 84,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 12,
        borderBottomWidth: 4,
        backgroundColor: "#56B2FF",
        borderColor: "#415369",
        position: "absolute",
        left: 996,
        top: 509,
        opacity: this.viewModel.expandedScale.interpolate([0, 1], [1, 0]),
      },
    });
  }

  private collapseButton(): UINode {
    return View({
      children: [View({ //button_dismiss
        children: [Image({ //icn_crossmark
          source: ImageSource.fromTextureAsset(this.props.inventory_crossmark!),
          style: {
            width: 24,
            height: 24,
            position: "absolute",
            flexShrink: 0
          }
        }),
        UINode.if(this.hudElementVisible.isActive(),
          UINode.if(this.viewModel.isClickable,
            Pressable({
              style: {
                width: "100%",
                height: "100%",
                position: "absolute",
              },
              onClick: () => this.setExpanded(false)
            })))],
        style: {
          display: "flex",
          width: 44,
          height: 48,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          position: "absolute",
          right: -40,
          top: 16,
          borderRadius: 8,
          borderBottomWidth: 4,
          backgroundColor: "#F05F69",
          borderColor: "#883643",
          marginTop: 8,
          left: 711,
        },
      })],
      style: {
        opacity: this.viewModel.expandedScale,
        position: "absolute",
      }
    });
  }

  private inventoryViewBackground(): UINode {
    return View({
      children: [],
      style: {
        height: 327,
        width: 720,
        borderRadius: 12,
        borderWidth: 4,
        borderColor: "#9898FF",
        backgroundColor: "#E0E7FF",
        position: "absolute",
        left: -4,
        opacity: this.viewModel.expandedScale
      }
    });
  }

  private inventoryHeader(): UINode {
    return View({ //Title
      children: [Text({ // INVENTORY
        text: "POTIONS",
        style: {
          display: "flex",
          width: 127,
          height: 24,
          flexDirection: "column",
          justifyContent: "center",
          color: "#2A325C",
          textAlign: "center",
          fontFamily: "Roboto",
          fontSize: 20,
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        height: 30,
        paddingVertical: 0,
        paddingHorizontal: 24,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        right: 12,
        top: -20,
        borderRadius: 16,
        backgroundColor: "#9898FF",
        marginTop: 8,
        flexDirection: "row",
        left: 540,
        opacity: this.viewModel.expandedScale
      }
    });
  }

  private inventoryItems(): UINode {
    const children = new Array<UIChildren>();
    for (let i = 0; i < MAX_ROWS; ++i) {
      const offset = i * MAX_ITEMS_PER_ROW;
      children.push(this.inventoryItemRow(offset));
    }
    return View({ //InventoryItemsGroup
      children,
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start"
      }
    });
  }

  private inventoryItemRow(offset: number): UINode {
    const children = new Array<UIChildren>();
    for (let i = offset; i < offset + MAX_ITEMS_PER_ROW; ++i) {
      children.push(this.inventoryItem(this.viewModel.items[i], i));
    }
    return View({ //InventoryRow
      children,
      style: {
        display: "flex",
        alignItems: "flex-start",
        alignSelf: "stretch",
        marginTop: 6,
        flexDirection: "row",
        top: -7,
      }
    });
  }

  private inventoryItem(viewModel: InventoryItemViewModel, index: number): UINode {
    return View({ //Cell Inventory HUD
      children: [View({
        children: [View({ //BG Inventory Item
          style: {
            width: 83,
            height: 83,
            flexShrink: 0,
            borderRadius: 3,
            borderWidth: 3,
            borderColor: "#B0B3B3",
            backgroundColor: viewModel.background,
            opacity: viewModel.backgroundOpacity,
            position: "absolute",
            left: 0,
            top: 0,
          },
        }),
        UINode.if(viewModel.hasItem, View({
          children: [
            UINode.if(this.hudElementVisible.isActive(),
              UINode.if(this.viewModel.isClickable,
                Pressable({
                  style: {
                    width: 83,
                    height: 83,
                  },
                  onClick: () => { this.onSlotClicked(index) }
                }))),
            Image({ //img_InventoryItem
              source: viewModel.itemImage,
              style: {
                width: 80,
                height: 80,
                flexShrink: 0,
                resizeMode: "cover",
                position: "absolute",
                left: 2,
                top: 2
              }
            }),
            Text({ // text_weight
              text: viewModel.weightText,
              style: {
                color: "#FFF",
                fontFamily: "Roboto",
                fontSize: 16,
                fontWeight: "900",
                position: "absolute",
                textAlign: "center",
                textAlignVertical: "center",
                width: 80,
                left: 0,
                top: 3
              }
            }),
            UINode.if(viewModel.isActive, View({
              children: [
                Text({ // text_weight
                  text: "ACTIVE",
                  style: {
                    color: "#FFF",
                    textAlign: "center",
                    fontFamily: "Roboto",
                    fontSize: 16,
                    fontWeight: "900"
                  }
                })],
              style: {
                display: "flex",
                paddingVertical: 0,
                paddingHorizontal: 9,
                height: 20,
                justifyContent: "center",
                alignItems: "center",
                flexDirection: "row",
                alignSelf: "center",
                position: "absolute",
                backgroundColor: "#55B473",
                borderRadius: 4,
                bottom: 4
              }
            })),
            UINode.if(viewModel.isLocked, Image({ //icon_locked
              source: ImageSource.fromTextureAsset(this.props.inventory_pinned!),
              style: {
                width: 24,
                height: 24,
                flexShrink: 0,
                position: "absolute",
                left: 54,
                top: 52
              }
            }))]
        })),
        UINode.if(viewModel.isPastCapacity, View({
          children: [
            Image({ //img_InventoryItem
              source: ImageSource.fromTextureAsset(this.props.inventory_crossmark!),
              style: {
                width: 80,
                height: 80,
                flexShrink: 0,
                resizeMode: "cover",
                position: "absolute",
                left: 2,
                top: 2
              }
            }),
          ]
        })),
        ],
        style: {
          opacity: viewModel.expandedScaleBinding
        }
      })],
      style: {
        width: 83,
        height: 83,
        marginLeft: 2,
        marginRight: 2,
      },
    });
  }

  private inventoryView(): UINode {
    return Pressable({
      children: [View({ //Inventory Expanded
        children: [
          this.inventoryViewBackground(),
          this.inventoryItems(),
          this.collapseButton(),
          this.inventoryHeader(),
          this.inventoryItemPopupMenu(),
        ],
        style: {
          display: "flex",
          height: 327,
          paddingVertical: 26,
          paddingHorizontal: 8,
          flexDirection: "column",
          alignItems: "flex-start",
          flexShrink: 0,
          position: "absolute",
          left: 345,
          top: this.viewModel.expandedScale.interpolate([0, 1], [484, 315]),
          opacity: this.viewModel.expandedScale,
        }
      })],
      style: {
        width: "100%",
        height: "100%",
        position: "absolute",
      },
      onClick: () => this.hideItemPopupAfterDelay(),
      disabled: this.viewModel.popup.isShowing.derive(isShowing => !isShowing),
    });
  }

  private inventoryItemPopupMenu(): UINode {
    return UINode.if(this.viewModel.popup.isShowing,
      View({
        children: [
          View({ //Inventory Item Menu
            children: [
              this.holdButton(),
              //this.pinButton()
            ],
            style: {
              display: "flex",
              padding: 16,
              flexDirection: "column",
              alignItems: "flex-start",
              borderRadius: 16,
              borderWidth: 4,
              borderColor: "#56B2FF",
              backgroundColor: "#E8F4FF",
              position: "absolute",
              left: this.viewModel.popup.x,
              top: this.viewModel.popup.y,
            }
          })
        ],
        style: {
          width: "100%",
          height: "100%",
          position: "absolute",
        }
      }));
  }

  private holdButton(): UINode {
    return Pressable({ //button_hold
      children: [Text({ // Hold
        text: "Deactivate",
        style: {
          display: "flex",
          width: 141,
          height: 32,
          flexDirection: "column",
          justifyContent: "center",
          flexShrink: 0,
          color: "#FFF",
          textAlign: "center",
          fontSize: 24,
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        width: 140,
        height: 56,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 12,
        borderBottomWidth: 4,
        backgroundColor: "#56B2FF",
        borderColor: "#415369"
      },
      onClick: () => this.unequip(this.selectedIndex)
    });
  }

  private pinButton(): UINode {
    return Pressable({ //button_pinUnpin
      children: [
        View({
          children: [Image({ //icn_pin
            source: this.viewModel.popup.pinImage,
            style: {
              width: 25,
              height: 25,
              marginRight: 8,
            }
          }),
          Text({ // text_pin
            text: this.viewModel.popup.pinText,
            style: {
              color: "#FFF",
              textAlign: "center",
              fontFamily: "Roboto",
              fontSize: 24,
              fontWeight: "700",
              marginRight: 8,
            }
          })],
          style: {
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginTop: 12,
          }
        })],
      style: {
        width: 140,
        height: 56,
        borderRadius: 12,
        borderBottomWidth: 4,
        backgroundColor: this.viewModel.popup.pinBG,
        borderColor: this.viewModel.popup.pinBottom,
        marginTop: 8,
      },
      onClick: () => this.toggleItemPin(this.selectedIndex)
    });
  }

  createView() {
    //    return View({});
    return View({ //UIInventory Expanded
      children: [
        //this.inventoryExpandButton(),
        //this.shovelEquipButton(),
        this.inventoryView(),
        this.potionPopup.createView(),
      ],
      style: {
        width: "100%",
        height: 608,
        position: "absolute",
        bottom: this.hudElementVisible.interpolate(["-50%", "0%"]),
      }
    });
  }
}

class InventoryViewModel {
  equippedShovelImage: Binding<ImageSource>;
  shovelLevel = new Binding("");
  expandedInventoryCountText = new Binding("");
  hasExpandedItems = new Binding(false);
  expandedScale = new AnimatedBinding(0);
  popup: InventoryPopupViewModel;
  items = new Array<InventoryItemViewModel>();
  isShovelEquipped = new Binding(false);
  isClickable = new Binding(true);

  constructor(numRows: number, itemsPerRow: number, missingImage: ImageSource) {
    this.equippedShovelImage = new Binding(missingImage);
    this.popup = new InventoryPopupViewModel(missingImage);
    for (let i = 0; i < numRows; i++) {
      // Always show first row, so force the expanded scale to always be 1
      const expandedScaleBinding: Bindable<number> = i === 0 ? 1 : this.expandedScale;
      for (let j = 0; j < itemsPerRow; j++) {
        this.items.push(new InventoryItemViewModel(missingImage, expandedScaleBinding));
      }
    }
  }
}

class InventoryItemViewModel {
  potionId = "";
  itemImage: Binding<ImageSource>;
  weightText = new Binding("");
  hasItem = new Binding(false);
  isActive = new Binding(false);
  isLocked = new Binding(false);
  expandedScaleBinding!: Bindable<number>;
  background = new Binding("#000000");
  backgroundOpacity = new Binding(.65);
  isPastCapacity = new Binding(false);

  constructor(missingImage: ImageSource, expandedScaleBinding: Bindable<number>) {
    this.itemImage = new Binding(missingImage);
    this.expandedScaleBinding = expandedScaleBinding;
  }
}

class InventoryPopupViewModel {
  isShowing = new Binding(false);
  x = new Binding(0);
  y = new Binding(0);
  pinImage: Binding<ImageSource>;
  pinText = new Binding("");
  pinBG = new Binding("#000000");
  pinBottom = new Binding("#000000");

  constructor(missingImage: ImageSource) {
    this.pinImage = new Binding(missingImage);
  }
}

class PotionPopup {
  private localPlayer: Player;
  private isVisible = new Binding(false);
  private viewModel!: ShovelPurchaseViewModel;
  private onSelectionCallback: (purchase: boolean) => void;
  private potionId!: string;

  constructor(localPlayer: Player, imageSource: ImageSource, onSelectionCallback: (purchase: boolean) => void) {
    this.localPlayer = localPlayer;
    this.onSelectionCallback = onSelectionCallback;
    this.createViewModel(imageSource);
  }

  private createViewModel(imageSource: ImageSource) {
    this.viewModel = new ShovelPurchaseViewModel(imageSource);
    for (let i = 0; i < MAX_CATEGORIES; i++) {
      this.viewModel.categories.push(new ShovelPurchaseCategoryViewModel());
    }
  }

  setVisible(isVisible: boolean) {
    this.isVisible.set(isVisible, [this.localPlayer]);
  }

  setup(potionId: string) {
    this.potionId = potionId;
    const potionData = PotionData.getPotionTuning(potionId);
    if (potionData === undefined) {
      return;
    }
    this.viewModel.shovelName.set(potionData.displayName, [this.localPlayer]);

    let description = potionData.description + '\n';
    const typeName = CategoryUIData.get(potionData.buffId).displayName;
    description += this.getPotionBuffDescription(potionData);
    this.viewModel.description.set(description, [this.localPlayer])
    let image = PotionData.getPotionImage(potionId)
    if (image) {
      this.viewModel.shovelImage.set(image, [this.localPlayer]);
    }
    else {
      log.info("Potion image not found for " + potionId);
    }

    // TODO - multiple categories?
    this.setupRarity(this.viewModel.categories[0], parseFloat(potionData.buffId));
  }

  private setupCategory(viewModel: ShovelPurchaseCategoryViewModel, categoryToBias?: string) {
    const isShown = categoryToBias !== undefined && categoryToBias !== "";
    viewModel.isShown.set(isShown, [this.localPlayer]);
    if (!isShown) {
      return;
    }
    const categoryData = CategoryUIData.get(categoryToBias);
    viewModel.categoryName.set(categoryData.displayName, [this.localPlayer]);
    viewModel.bgColor.set(categoryData.color.toHex(), [this.localPlayer]);
  }

  private setupRarity(viewModel: ShovelPurchaseCategoryViewModel, rarity?: number) {
    const isShown = rarity !== undefined
    viewModel.isShown.set(isShown, [this.localPlayer]);
    if (!isShown) {
      return;
    }

    const rarityName = ItemUtils.RARITY_TEXT[rarity]
    viewModel.categoryName.set(rarityName);
    const rarityColor = ItemUtils.RARITY_HEX_COLORS[rarity]
    viewModel.bgColor.set(rarityColor, [this.localPlayer]);
  }

  toPercent(value: number, decimals: number = 0): string {
    return `${(value * 100).toFixed(decimals)}%`;
  }

  getPotionBuffDescription(tuning: PotionTuning): string {
    if (tuning.buffType === PotionBuffType.Category) {
      return "Boosts digs for type " + tuning.buffId + " for " + tuning.duration + " minutes.";
    }

    if (tuning.buffType === PotionBuffType.Rarity) {
      const rarity = parseFloat(tuning.buffId);
      const rarityName = ItemUtils.RARITY_TEXT[rarity]
      const firstNonZeroBuffValue = tuning.buffValue.find(value => value !== 0)!;
      return `${tuning.details} (${this.toPercent(tuning.minigameBoost)} more likely)`;
    }

    return 'This potion does nothing.'
  }

  private categoryHeader(): UINode {
    return View({
      children: [
        Text({ // Discovers:
          text: "Boosts:",
          style: {
            flexShrink: 0,
            textAlign: "left",
            textAlignVertical: "center",
            color: "#7B5B3D",
            fontSize: 20,
            fontFamily: "Roboto",
            fontWeight: "700"
          }
        }),
        View({ //Spacer
          style: {
            width: 8,
            height: 8
          }
        })],
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
      }
    })
  }

  private categoryTag(viewModel: ShovelPurchaseCategoryViewModel): UINode {
    return UINode.if(viewModel.isShown, View({ //Frame 6
      children: [UI_Utils.outlinedText({ // Tag
        text: viewModel.categoryName,
        outlineSize: 1,
        style: {
          color: "#FFF",
          fontSize: 20,
          fontFamily: "Roboto",
          fontWeight: "700"
        }
      })],
      style: {
        display: "flex",
        paddingVertical: 4,
        paddingHorizontal: 16,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 18,
        backgroundColor: viewModel.bgColor,
        marginRight: 8,
        flexDirection: "row"
      }
    }));
  }

  createView() {
    const categoryChildren = new Array<UIChildren>();
    categoryChildren.push(this.categoryHeader());
    for (let i = 0; i < MAX_CATEGORIES; ++i) {
      categoryChildren.push(this.categoryTag(this.viewModel.categories[i]));
    }

    return UINode.if(this.isVisible, View({ //UIPurchasePopup
      children: [
        View({ //Purchase Widget
          children: [
            View({ //BG Group
              children: [
                View({ //BG
                  children: [],
                  style: {
                    width: 600,
                    flexGrow: 1,
                    flexShrink: 0,
                    flexBasis: 0,
                    borderRadius: 12,
                    borderWidth: 4,
                    borderColor: "#FFCD46",
                    backgroundColor: "#FFEECB"
                  }
                }),
                View({ //Spacer
                  style: {
                    width: 24,
                    height: 24
                  }
                })],
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                width: 600,
                alignSelf: "stretch"
              }
            }),
            View({ //Content
              children: [
                View({ //Title
                  children: [Text({ // Purchase shovel?
                    text: "Select potion?",
                    style: {
                      color: "#6E2F0E",
                      textAlign: "center",
                      textAlignVertical: "center",
                      fontFamily: "Roboto",
                      fontSize: 24,
                      fontWeight: "700"
                    }
                  })],
                  style: {
                    display: "flex",
                    height: 36,
                    paddingVertical: 0,
                    paddingHorizontal: 24,
                    justifyContent: "center",
                    alignItems: "center",
                    alignSelf: "center",
                    position: "absolute",
                    top: -16,
                    borderRadius: 16,
                    backgroundColor: "#FFCD46",
                    flexDirection: "row"
                  }
                }),
                View({ //Horizontal Group
                  children: [
                    View({ //Left Panel
                      children: [View({ //Property Group
                        children: [
                          View({ //Name Level Group
                            children: [Text({ // UFO
                              text: this.viewModel.shovelName,
                              style: {
                                color: "#5C3B1B",
                                textAlign: "center",
                                fontFamily: "Roboto",
                                fontSize: 25,
                                fontWeight: "900"
                              }
                            }),
                            ],
                            style: {
                              display: "flex",
                              alignItems: "center",
                              flexDirection: "row",
                              paddingTop: 16,
                              width: 400,
                            }
                          }),
                          Text({ // “Flavor text ”
                            text: this.viewModel.description,
                            style: {
                              width: 400,
                              color: "#7B5B3D",
                              fontSize: 20,
                              fontWeight: "700",
                              flexWrap: "wrap",
                            }
                          }),],
                        style: {
                          display: "flex",
                          width: 400,
                          flexDirection: "column",
                          justifyContent: "flex-start",
                          alignItems: "flex-start",
                          position: "relative"
                        }
                      }),
                      ],
                      style: {
                        display: "flex",
                        width: 400,
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        alignItems: "flex-start",
                        paddingVertical: 8
                      }
                    }),
                    View({ //Item Group
                      children: [Image({ //icn_Shovel
                        source: this.viewModel.shovelImage,
                        style: {
                          width: 270 / 2,
                          height: 270 / 2,
                          resizeMode: "cover",
                          position: "absolute",
                          left: 12,
                          top: 25,
                        }
                      })],
                      style: {
                        display: "flex",
                        width: 150,
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        alignSelf: "stretch",
                        marginLeft: 4
                      }
                    })],
                  style: {
                    display: "flex",
                    alignItems: "flex-start",
                    alignSelf: "stretch",
                    flexDirection: "row"
                  }
                }),
                // View({ //Tags
                //   children: categoryChildren,
                //   style: {
                //     display: "flex",
                //     width: "100%",
                //     alignItems: "flex-start",
                //     justifyContent: "flex-start",
                //     alignSelf: "stretch",
                //     marginTop: 4,
                //     flexDirection: "row"
                //   }
                // }),
                View({ //Btn Group
                  children: [
                    Pressable({ //BtnMain
                      children: [UI_Utils.outlinedText({ // NO
                        text: "No",
                        outlineSize: 0,
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          flexShrink: 0,
                          alignSelf: "stretch",
                          color: "#61470B",
                          fontSize: 24,
                          fontFamily: "Roboto",
                          fontWeight: "700"
                        }
                      })],
                      style: {
                        display: "flex",
                        width: 160,
                        height: 48,
                        justifyContent: "center",
                        alignItems: "center",
                        flexShrink: 0,
                        borderRadius: 16,
                        borderBottomWidth: 4,
                        backgroundColor: "#FFCB5C",
                        borderColor: "#CCA855",
                        flexDirection: "row"
                      },
                      onClick: () => this.onSelectionCallback(false),
                    }),
                    Pressable({ //BtnMain
                      children: [UI_Utils.outlinedText({ // YES!
                        text: "Yes",
                        outlineSize: 0,
                        style: {
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          flexShrink: 0,
                          alignSelf: "stretch",
                          color: "#FFF",
                          fontSize: 24,
                          fontFamily: "Roboto",
                          fontWeight: "700"
                        }
                      })],
                      style: {
                        display: "flex",
                        width: 160,
                        height: 48,
                        justifyContent: "center",
                        alignItems: "center",
                        flexShrink: 0,
                        borderRadius: 16,
                        borderBottomWidth: 4,
                        backgroundColor: "#70C04E",
                        borderColor: "#49A24C",
                        marginLeft: 8,
                        flexDirection: "row"
                      },
                      onClick: () => this.onSelectionCallback(true),
                    })],
                  style: {
                    display: "flex",
                    alignItems: "center",
                    marginTop: 16,
                    flexDirection: "row"
                  }
                })],
              style: {
                display: "flex",
                width: 600,
                marginLeft: -600,
                paddingVertical: 0,
                paddingHorizontal: 24,
                flexDirection: "column",
                alignItems: "center",
                flexShrink: 0
              }
            })],
          style: {
            display: "flex",
            width: 600,
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "center",
            flexShrink: 0,
            flexDirection: "row"
          }
        }),
      ],
      style: {
        display: "flex",
        paddingLeft: 70,
        width: "100%",
        height: "95%",
        justifyContent: "center",
        alignItems: "center",
        flexShrink: 0,
        flexDirection: "row",
        position: "absolute",
        bottom: 150,
      }
    }
    ));
  }
}

class ShovelPurchaseViewModel {
  shovelName = new Binding("");
  shovelImage: Binding<ImageSource>;
  description = new Binding("");
  categories = new Array<ShovelPurchaseCategoryViewModel>();

  constructor(imageSource: ImageSource) {
    this.shovelImage = new Binding(imageSource);
  }
}

class ShovelPurchaseCategoryViewModel {
  isShown = new Binding(false);
  categoryName = new Binding("");
  bgColor = new Binding("#000000");
}
