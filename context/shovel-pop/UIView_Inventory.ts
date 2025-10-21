/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_Player_Inventory } from 'BigBox_Player_Inventory';
import { allHudElementTypes, HUDElementType } from 'Enums';
import { Events } from 'Events';
import { Timer } from 'GameUtils';
import { Asset, EventSubscription, NetworkEvent, Player } from 'horizon/core';
import { AnimatedBinding, Bindable, Binding, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { HUDAnimations } from 'HUDAnimations';
import { AnimatedHUDElementVisibilityTracker } from 'HUDElementVisibilityTracker';
import { ItemContainer } from 'ItemContainer';
import { ItemData } from 'ItemData';
import { Logger } from 'Logger';
import { Shovel } from 'Shovel';
import { ShovelData } from 'ShovelData';
import { AnalyticsManager, LogType } from 'TurboAnalytics';
import { UIView_InteractionNonBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';

const MAX_ITEMS_PER_ROW = 8;
const MAX_ROWS = 3;
const MAX_ITEMS = MAX_ITEMS_PER_ROW * MAX_ROWS;
const ITEM_WIDTH = 87;
const POPUP_OFFSET_X = -38;
const POPUP_OFFSET_Y = -134;

const CLICK_COOLDOWN = 0.5;

const log = new Logger("UIView_Inventory");

export type SlotData = {
  itemId: string,
  index: number,
  weight?: number,
  selected?: boolean,
  isLocked?: boolean,
  mutation?: string
}

export class UIView_Inventory extends UIView_InteractionNonBlockingBase {
  private viewModel!: InventoryViewModel;
  private isExpanded: boolean = false;
  private isAnimating: boolean = false;
  private isShovelEquipped: boolean = false;
  private clickCooldown: Timer = new Timer(0);
  private isPopupShowing: boolean = false;
  private changeSlotSubscription: EventSubscription | undefined;
  private hudElementVisible!: AnimatedHUDElementVisibilityTracker;

  private shovelData: ShovelData | undefined;
  private selectedIndex: number = -1;
  private equippedIndex: number = -1;
  private expandedItemCount = 0;
  private slots = new Array<SlotData | undefined>(MAX_ITEMS).fill(undefined);
  private inventorySize = MAX_ITEMS; // We will get from the server the real inventory size

  public static onSlotEquipSelected = new NetworkEvent<{ owner: Player, index: number, selected: boolean }>("sendSlotSelected")
  public static changeSlot = new NetworkEvent<SlotData>("recieveSlotData")

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);
    this.props = uiRoot.props;
    this.viewModel = new InventoryViewModel(MAX_ROWS, MAX_ITEMS_PER_ROW, ImageSource.fromTextureAsset(this.props.missingTexture!));
    this.hudElementVisible = new AnimatedHUDElementVisibilityTracker(HUDElementType.Inventory, HUDAnimations.inventoryHideAnimation);
    this.changeSlotSubscription = this.uiRoot.connectNetworkEvent(this.uiRoot.entity, UIView_Inventory.changeSlot, data => this.onDataReceived(data));

    this.uiRoot.connectLocalBroadcastEvent(Events.localPlayerShovelChanged, (payload) => {
      log.info("received this.localPlayerShovelChanged event shoveldata " + payload.shovelData);
      this.shovelData = payload.shovelData;
      this.onShovelDataUpdate();
    });

    this.uiRoot.sendNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventorySize, { player: this.localPlayer });
    this.uiRoot.connectNetworkBroadcastEvent(BigBox_Player_Inventory.requestInventorySizeUpdated, (payload) => {
      this.onInventorySizeUpdated(payload.size);
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.localSetShovelLevel, () => {
      this.setShovelLevel();
    })

    this.uiRoot.connectNetworkBroadcastEvent(Shovel.equip, () => {
      this.unequipCurrentEquipment();
    });

    this.hudElementVisible.connect(this.uiRoot);
    for (let i = 0; i < MAX_ITEMS; i++) {
      this.updateBackground(i);
    }

    if (ItemContainer.localInstance?.isDataLoaded()){
      this.uiRoot.sendNetworkBroadcastEvent(Events.requestInventory, { player: this.localPlayer }, [this.serverPlayer]);
    }
    else{
      const sub = this.uiRoot.connectLocalBroadcastEvent(ItemContainer.itemDataLoadComplete, payload => {
        this.uiRoot.sendNetworkBroadcastEvent(Events.requestInventory, { player: this.localPlayer }, [this.serverPlayer]);
        sub.disconnect();
      })
    }
  }

  private onDataReceived(data: SlotData) {
    log.info(`received changeSlot event -  index:(${data.index})  itemId: ${data.itemId}  selected: ${data.selected}  isLocked: ${data.isLocked}`);
    const index = data.index;
    const itemId = data.itemId;
    if (index < 0 || index >= this.viewModel.items.length) {
      log.error("Tried to adjust data for a slot outside our capacity for item: " + itemId + "  index: " + index);
      return
    }
    let itemViewModel = this.viewModel.items[index];
    let isPastCapacity = index >= this.inventorySize;
    let isEmpty = data.itemId === '' || isPastCapacity; // slots past capacity are effectively empty
    let wasEmpty = this.slots[index] === undefined;
    this.slots[index] = isEmpty ? undefined : data;
    itemViewModel.hasItem.set(!isEmpty, [this.localPlayer]);
    log.info("data slot: " + index + " inventory size: " + this.inventorySize)
    itemViewModel.isPastCapacity.set(index >= this.inventorySize, [this.localPlayer]);
    this.updateBackground(index);
    if (isEmpty) {
      if (!wasEmpty && index >= MAX_ITEMS_PER_ROW) {
        this.decrementExpandedItemCount();
      }
      itemViewModel.hasMutation.set(false, [this.localPlayer]);
      return;
    }
    if (wasEmpty && index >= MAX_ITEMS_PER_ROW) {
      this.incrementExpandedItemCount();
    }
    if (ItemContainer.localInstance === undefined) {
      log.error("ItemContainer is not ready!");
    }
    let itemData: ItemData | undefined = ItemContainer.localInstance?.getItemDataForId(itemId);
    const weightText = data.weight ? data.weight + "kg" : "";
    itemViewModel.weightText.set(weightText, [this.localPlayer]);
    let textureAsset: Asset = this.props.missingTexture!;
    if (itemData !== undefined) {
      let iconAsset = itemData.getIconAsset();
      if (iconAsset) {
        textureAsset = iconAsset;
      }
      itemViewModel.itemImage.set(ImageSource.fromTextureAsset(textureAsset), [this.localPlayer]);
    }
    itemViewModel.isLocked.set(data.isLocked ?? false, [this.localPlayer]);

    const mutationData = ItemContainer.localInstance?.getMutationDataForId(data.mutation ?? "");
    if (mutationData) {
      itemViewModel.itemTint.set(mutationData.itemTint, [this.localPlayer]);
      const mutationBackground = mutationData.getUIBackgroundTexture();
      if (mutationBackground) {
        itemViewModel.hasMutation.set(true, [this.localPlayer]);
        itemViewModel.mutationBackground.set(ImageSource.fromTextureAsset(mutationBackground));
      } else {
        itemViewModel.hasMutation.set(false, [this.localPlayer]);
      }
    } else {
      itemViewModel.hasMutation.set(false, [this.localPlayer]);
      itemViewModel.itemTint.set("#FFFFFF", [this.localPlayer]);
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
      if (this.isAnimating || !this.clickCooldown.Complete()) {
        return;
      }
      if (index >= MAX_ITEMS_PER_ROW && !this.isExpanded) {
        return;
      }
      log.info(`OnSlotClicked (${index})`);
      this.showItemPopup(index);
    }, 30);
  }

  private showItemPopup(index: number) {
    const slotData = this.slots[index];
    if (slotData === undefined) {
      return;
    }
    this.click();
    this.unselectCurrentSelection();
    this.selectedIndex = index;
    this.updateBackground(index);
    this.isPopupShowing = true;
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
      itemViewModel.background.set("#FFCD17", [this.localPlayer]);
      itemViewModel.backgroundOpacity.set(1, [this.localPlayer]);
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
    if (!this.isPopupShowing || !this.clickCooldown.Complete()) {
      return;
    }
    this.isPopupShowing = false;
    this.viewModel.popup.isShowing.set(false, [this.localPlayer]);
    this.unselectCurrentSelection();
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
    this.uiRoot.sendNetworkEvent(this.uiRoot.entity, UIView_Inventory.onSlotEquipSelected, {
      owner: this.localPlayer,
      index: index,
      selected: true
    });
  }

  private unequipCurrentEquipment() {
    if (this.equippedIndex < 0) {
      return;
    }
    const index = this.equippedIndex;
    this.equippedIndex = -1;
    this.updateBackground(index);
    log.info(`sending onSlotEquipSelected event-  index - ${index}  selected - false`);
    this.uiRoot.sendNetworkEvent(this.uiRoot.entity, UIView_Inventory.onSlotEquipSelected, {
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
    if (textureAsset === undefined) {
      log.error("Shovel icon texture is not defined");
      textureAsset = this.props.missingTexture!;
    }
    this.viewModel.equippedShovelImage.set(ImageSource.fromTextureAsset(textureAsset), [this.localPlayer]);
    this.setShovelLevel();
  }

  private setShovelLevel() {
    if (this.shovelData === undefined) {
      return;
    }

    this.viewModel.shovelLevel.set(`Lv. ${Shovel.getLevel(this.shovelData.id) + 1}`);
  }

  private onShovelEquipPressed() {
    if (!this.clickCooldown.Complete()) {
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
    if (this.isShovelEquipped) {
      log.info(`equipped ${this.shovelData!.name}`)
      this.uiRoot.sendNetworkBroadcastEvent(AnalyticsManager.clientLogToServer, { player: this.localPlayer, log_type: LogType.WEAPON_EQUIP, weaponKey: `shovel,${this.shovelData!.name}` }, [this.serverPlayer]);
    }
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
    this.clickCooldown.SetTime(CLICK_COOLDOWN)
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
        this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context, exclude: allHudElementTypes & ~HUDElementType.AboveInventory });
      }
    }, [this.localPlayer]);
    if (!this.isExpanded) {
      this.hideItemPopup();
    }
    else {
      this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context, exclude: allHudElementTypes & ~HUDElementType.AboveInventory });
    }
    this.click();
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
            backgroundColor: this.viewModel.isShovelEquipped.derive(isEquipped => isEquipped ? "#FFCD17" : "#808284"),
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
        right: 44,
        top: 200,
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
        left: 1026,
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
        borderColor: "#56B2FF",
        backgroundColor: "#E8F4FF",
        position: "absolute",
        left: -4,
        opacity: this.viewModel.expandedScale
      }
    });
  }

  private inventoryHeader(): UINode {
    return View({ //Title
      children: [Text({ // INVENTORY
        text: "INVENTORY",
        style: {
          display: "flex",
          width: 127,
          height: 24,
          flexDirection: "column",
          justifyContent: "center",
          color: "#415369",
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
        backgroundColor: "#71BEFF",
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
    return View({ //Inventory Items Group
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
    return View({ //Inventory Row
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
            UINode.if(viewModel.hasMutation, Image({
              source: viewModel.mutationBackground,
              style: {
                width: 80,
                height: 80,
                flexShrink: 0,
                resizeMode: "cover",
                position: "absolute",
                left: 2,
                top: 2
              }
            })),
            Image({ //img_InventoryItem
              source: viewModel.itemImage,
              style: {
                width: 80,
                height: 80,
                flexShrink: 0,
                resizeMode: "cover",
                position: "absolute",
                tintColor: viewModel.itemTint,
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
              source: ImageSource.fromTextureAsset(this.props.inventory_pin!),
              style: {
                width: 36,
                height: 36,
                flexShrink: 0,
                resizeMode: "cover",
                top: 22,
                left: 23
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
          left: 310,
          //top: 320
          top: this.viewModel.expandedScale.interpolate([0, 1], [484, 315])
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
              this.pinButton()
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
        text: "Hold",
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
      onClick: () => this.equip(this.selectedIndex)
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
    return View({ //UIInventoryExpanded
      children: [
        View({
          children: [
            this.inventoryExpandButton(),
            this.inventoryView()
          ],
          style: {
            width: "100%",
            height: 608,
            position: "absolute",
            bottom: this.hudElementVisible.interpolate(["-40%", "0%"]),
          }
        }),
        // View({
        //   children: [
        //     this.shovelEquipButton()
        //   ],
        //   style: {
        //     position: "absolute",
        //     right: this.hudElementVisible.interpolate(["-30%", "0%"]),
        //   }
        // })

      ],
      style: {
        position: "absolute",
        width: "100%",
        height: "100%"
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
  itemImage: Binding<ImageSource>;
  mutationBackground: Binding<ImageSource>;
  weightText = new Binding("");
  hasItem = new Binding(false);
  hasMutation = new Binding(false);
  isLocked = new Binding(false);
  expandedScaleBinding!: Bindable<number>;
  background = new Binding("#000000");
  backgroundOpacity = new Binding(.65);
  isPastCapacity = new Binding(true);
  itemTint = new Binding("#FFFFFF");

  constructor(missingImage: ImageSource, expandedScaleBinding: Bindable<number>) {
    this.itemImage = new Binding(missingImage);
    this.mutationBackground = new Binding(missingImage);
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
