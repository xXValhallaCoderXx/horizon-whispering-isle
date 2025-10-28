import * as hz from 'horizon/core'
import * as ui from 'horizon/ui'
import {  CUIStyles,
          ItemStatus,
          ItemType,
          StoreEntityRegistry,
          StoreImage,
          BlankImage,
          CurrencyDefsType,
          CurrencyType,
          MAX_CURRENCY,
} from 'StoreTypes'

import { cleanNumberDisplay } from 'Utils'
/**
 * A network event broadcast when a player clicks the purchase button in the store UI.
 * This event contains all the necessary data for the server to process the purchase.
 * @param storeId The unique ID of the store entity.
 * @param itemId The unique ID of the item being purchased.
 * @param status The current status of the item (e.g., Purchase, Upgrade, Owned).
 * @param price The price of the item.
 * @param level The current level of the item.
 * @param player The player who initiated the purchase.
 */
export const playerPurchaseEvent = new hz.NetworkEvent<{storeId: bigint, itemId: string, status: ItemStatus, price: CurrencyType, level: number, player: hz.Player}>("playerPurchaseEvent")

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'

/**
 * Represents the custom UI component for a storefront.
 * This class handles the layout, styling, and interactivity of the in-game store.
 */
class StoreFront_CUI extends ui.UIComponent<typeof StoreFront_CUI> {
  static propsDefinition = {
    storeName: { type: hz.PropTypes.String, default: 'Shop' },
    clickSound: { type: hz.PropTypes.Entity },
    hoverSound: { type: hz.PropTypes.Entity },
  }

  /*
  The store custom ui is laid out per the below diagram with several regions:

  +------------------------------------------+-------------------+
  |                                                              |
  |+----------------------------------------+-------------------+|
  || Title                                  |      Currency     ||
  |+----------------------------------------+-------------------+|
  ||                    .                   |                   ||
  ||        Item        .       Item        |       Detail      ||
  ||       Slot 0       .      Slot 1       |        Area       ||
  ||                    .                   |                   ||
  ||                    .                   |                   ||
  ||. . . . . . . . . . . . . . . . . . . . |                   ||
  ||                    .                   |                   ||
  ||        Item        .       Item        |                   ||
  ||       Slot 2       .      Slot 3       |                   ||
  ||                    .                   |                   ||
  ||                    .                   |                   ||
  |+----------------------------------------+-------------------+|
  +------------------------------------------+-------------------+
  
  * Overall Custom UI size:
    * panelWidth (1920) x panelHeight (1080) defines the custom UI screen size.
    
  * Store Size:
    * storeSize = { left: 15, top: 120, width: 1890, height: 940 }
    * This is the main drawing area within the custom UI, leaving margins for mobile buttons and other UI elements.
  
  * Title Size:
    * titleSize is 2/3 of the storeSize width and 90 pixels high.
  
  * Currency Size:
    * currencySize is the remaining 1/3 of the storeSize width and 90 pixels high.
  
  * Inventory Size:
    * inventorySize is 2/3 of the storeSize width and the remaining height (850 pixels).
    * This area displays all the store's items and wraps when children exceed its width.
  
  * Item Size:
    * itemSize is 1/2 of the inventory width and height. Up to 4 items can be displayed in the default layout.
  
  * Detail Size:
    * detailSize is the remaining 1/3 of the storeSize width and the remaining height (850 pixels).
    * This area displays detailed information about the selected item.
  
  * ItemImage Size:
    * itemImageSize is used for drawing images on each item and in the detail area.
  
  */

  panelWidth = 1920
  panelHeight = 1080

  // Default Settings for Layouts:
  // Margin used for all UI elements, except for image insets.
  margin = 10

  // Margin used for the item image insets.
  insetSideMargin = 50
  insetTopMargin = 60

  // Sizes for the UI regions as defined in the layout diagram.
  // Store's Width: 1890
  // 630 = 1/3 Store's Width
  // 1260 = 2/3 Store's Width
  // Store's Height: 940
  // 90 = height used for Title and Currency display
  // 850 = remaining size left
  // 425 = 1/2 of 850
  storeSize = { left: 15, top: 120, width: 1890, height: 940 }
  titleSize = { left: 0, top: 0, width: 630, height: 90 }
  currencySize = { left: 1260, top: 0, width: 630, height: 90 }
  inventorySize = { left: 0, top: 90, width: 1260, height: 850 }
  itemSize = { left: 0, top: 0, width: 630, height: 425 }
  itemImageSize = { left: 0, top: 0, width: 630 - this.margin, height: 425 - this.margin }
  detailSize = { left: 1260, top: 90, width: 630, height: 850 }

  // Border settings for various UI elements.
  borderWidth: number = 4
  borderRadius: number = 20
  borderColor: ui.ColorValue = hz.Color.black
  borderSideWidth: number = 6

  // Color properties for the purchase button based on item status.
  purchaseBackground: ui.ColorValue = hz.Color.black
  purchaseGradientA: ui.ColorValue = 'rgb(77, 241, 96)'
  purchaseGradientB: ui.ColorValue = 'rgb(2, 161, 2)'

  upgradeBackground: ui.ColorValue = hz.Color.black
  upgradeGradientA: ui.ColorValue = 'rgb(77, 241, 96)'
  upgradeGradientB: ui.ColorValue = 'rgb(2, 161, 2)'

  ownedBackground: ui.ColorValue = hz.Color.black
  ownedGradientA: ui.ColorValue = 'rgb(255, 213, 117)'
  ownedGradientB: ui.ColorValue = 'rgb(245, 179, 26)'

  lockedBackground: ui.ColorValue = hz.Color.black
  lockedGradientA: ui.ColorValue = 'rgb( 119, 112, 152)'
  lockedGradientB: ui.ColorValue = 'rgb(66, 63, 85)'

  // Background colors used for different UI regions.
  storeNameBackground: ui.ColorValue = 'rgb(20, 40, 67)'
  insetBackground: ui.ColorValue = 'rgb(44, 74, 108)'
  itemBackground: ui.ColorValue = 'rgb(68, 174, 206)'
  itemSelectedBackground: ui.ColorValue = 'rgb(255, 205, 90)'

  // Font and text style properties for various UI elements.
  titleFont: ui.FontFamily = 'Bangers'
  titleFontSize = 60
  titleSpacing = 20
  titleWeight: FontWeight = '400'
  titleFontColor: ui.ColorValue = hz.Color.white
  titleShadowColor: ui.ColorValue = hz.Color.black
  titleShadowOffset: [number, number] | undefined = [0, 6]

  currencyFont: ui.FontFamily = 'Roboto'
  currencyFontSize = 45
  currencySpacing = undefined
  currencyWeight: FontWeight = '900'
  currencyFontColor: ui.ColorValue = hz.Color.white
  currencyShadowColor: ui.ColorValue | undefined = hz.Color.black
  currencyShadowOffset: [number, number] | undefined = [0, 6]

  itemFont: ui.FontFamily = 'Roboto'
  itemFontSize = 45
  itemSpacing = undefined
  itemWeight: FontWeight = '900'
  itemFontColor: ui.ColorValue = hz.Color.white
  itemShadowColor: ui.ColorValue | undefined = hz.Color.black
  itemShadowOffset: [number, number] | undefined = [0, 6]

  detailFont: ui.FontFamily = 'Roboto'
  detailFontSize = 45
  detailSpacing = undefined
  detailWeight: FontWeight = '900'
  detailFontColor: ui.ColorValue = hz.Color.white
  detailShadowColor: ui.ColorValue | undefined = hz.Color.black
  detailShadowOffset: [number, number] | undefined = [0, 6]

  purchaseFont: ui.FontFamily = 'Bangers'
  purchaseFontSize = 70
  purchaseSpacing = 20
  purchaseWeight: FontWeight = '400'
  purchaseFontColor: ui.ColorValue = hz.Color.white
  purchaseShadowColor: ui.ColorValue = hz.Color.black
  purchaseShadowOffset: [number, number] | undefined = [0, 8]

  // Text label for item levels.
  LevelLabel = 'Level: '

  // Styles defined for different UI regions.
  TitleStyle: CUIStyles =
  {
    tabNo: 0,
    size: { left: this.titleSize.left, top: this.titleSize.top, width: this.titleSize.width, height: this.titleSize.height },
    layout: {
      left: this.margin, top: this.margin, width: this.titleSize.width - this.margin * 2, height: this.titleSize.height - this.margin * 2,
      backgroundColor: this.storeNameBackground,
      borderColor: this.borderColor, borderRadius: this.borderRadius, borderWidth: this.borderWidth,
    }
  }

  CurrencyStyle: CUIStyles =
  {
    tabNo: 0,
    size: { left: this.currencySize.left, top: this.currencySize.top, width: this.currencySize.width, height: this.currencySize.height },
    layout: {
      left: this.margin, top: this.margin, width: this.currencySize.width - this.margin * 2, height: this.currencySize.height - this.margin * 2,
      backgroundColor: this.itemBackground,
      borderColor: this.borderColor, borderRadius: this.borderRadius, borderWidth: this.borderWidth,
    }
  }

  InventoryStyle: CUIStyles =
  {
    tabNo: 0,
    size: { left: this.inventorySize.left, top: this.inventorySize.top, width: this.inventorySize.width, height: this.inventorySize.height },
    layout: {},
  }

  ItemStyle: CUIStyles =
  {
    tabNo: 0,
    size: { left: this.itemSize.left, top: this.itemSize.top, width: this.itemSize.width, height: this.itemSize.height },
    layout: {
      left: this.margin, top: this.margin, width: this.itemSize.width - this.margin * 2, height: this.itemSize.height - this.margin * 2,
      backgroundColor: this.itemBackground,
      borderColor: this.borderColor, borderRadius: this.borderRadius, borderWidth: this.borderWidth,
    }
  }

  DetailStyle: CUIStyles =
  {
    tabNo: 0,
    size: { left: this.detailSize.left, top: this.detailSize.top, width: this.detailSize.width, height: this.detailSize.height },
    layout: {
      left: this.margin, top: this.margin, width: this.detailSize.width - this.margin * 2, height: this.detailSize.height - this.margin * 2,
      backgroundColor: this.itemBackground,
      borderColor: this.borderColor, borderRadius: this.borderRadius, borderWidth: this.borderWidth,
    }
  }

  // Properties for the purchase button label and color, indexed by ItemStatus.
  PurchaseButton = {
    label: [ 'PURCHASE', 'UPGRADE', 'OWNED', 'LOCKED', 'HIDDEN' ],
    textColor: [ this.purchaseFontColor, this.purchaseFontColor, this.purchaseFontColor, this.purchaseFontColor, this.purchaseFontColor ],
    color: [ this.purchaseBackground, this.upgradeBackground, this.ownedBackground, this.lockedBackground, hz.Color.black ],
    gradientA: [ this.purchaseGradientA, this.upgradeGradientA, this.ownedGradientA, this.lockedGradientA, hz.Color.black ],
    gradientB: [ this.purchaseGradientB, this.upgradeGradientB, this.ownedGradientB, this.lockedGradientB, hz.Color.black ],
  }

  // Style for the item image display.
  ItemImageStyle: CUIStyles =
  {
    tabNo: -1,
    size: { left: this.itemImageSize.left, top: this.itemImageSize.top, width: this.itemImageSize.width, height: this.itemImageSize.height },
    layout: {
      left: this.insetSideMargin, top: this.insetTopMargin,
      width: this.itemImageSize.width - this.insetSideMargin * 2 - this.margin * 2 - this.borderWidth * 2 - this.margin * 2,
      height: this.itemImageSize.height - this.insetTopMargin * 2 - this.margin * 2 - this.borderWidth * 2,
      backgroundColor: this.insetBackground,
      borderColor: this.borderColor, borderRadius: this.borderRadius, borderWidth: this.borderWidth,
    }
  }

  // ******************************************************************************************************************************

  // UI Bindings for the Store Screens. These link the UI to the underlying data.

  // Array of UI bindings for each item in the store.
  StoreItems: Array<ui.Binding<ItemType>> = [
    new ui.Binding<ItemType>({ id: 'id 1', name: 'Name 1', description: 'Description 1', level: 0, price: [0, 0, 0, 0], startStatus: ItemStatus.Hidden, status: ItemStatus.Hidden, itemImage: BlankImage, statusImages: [ BlankImage, BlankImage, BlankImage, BlankImage, BlankImage ] }),
    new ui.Binding<ItemType>({ id: 'id 2', name: 'Name 2', description: 'Description 2', level: 0, price: [0, 0, 0, 0], startStatus: ItemStatus.Hidden, status: ItemStatus.Hidden, itemImage: BlankImage, statusImages: [ BlankImage, BlankImage, BlankImage, BlankImage, BlankImage ] }),
    new ui.Binding<ItemType>({ id: 'id 3', name: 'Name 3', description: 'Description 3', level: 0, price: [0, 0, 0, 0], startStatus: ItemStatus.Hidden, status: ItemStatus.Hidden, itemImage: BlankImage, statusImages: [ BlankImage, BlankImage, BlankImage, BlankImage, BlankImage ] }),
    new ui.Binding<ItemType>({ id: 'id 4', name: 'Name 4', description: 'Description 4', level: 0, price: [0, 0, 0, 0], startStatus: ItemStatus.Hidden, status: ItemStatus.Hidden, itemImage: BlankImage, statusImages: [ BlankImage, BlankImage, BlankImage, BlankImage, BlankImage ] }),
    // To add more items, increase this array and ensure the layout can accommodate them.
  ]

  // Binding for the item currently displayed in the detail panel.
  StoreItemDetails = new ui.Binding<ItemType>({ id: 'id 0', name: 'Name 1', description: 'Description 1', level: 0, price: [0, 0, 0, 0], startStatus: ItemStatus.Hidden, status: ItemStatus.Hidden, itemImage: BlankImage, statusImages: [ BlankImage, BlankImage, BlankImage, BlankImage, BlankImage ] })

  // Binding for the ID of the selected item.
  StoreSelectedItem = new ui.Binding<string>('')

  // Binding for the player's currency.
  CurrencyList = new ui.Binding<CurrencyType>([ 0, 0, 0, 0])

  // Binding to control which tab is visible (not used in this default implementation).
  VisibleTab = new ui.Binding<number>(0)

  // Bindings for currency icons and the number of currency types to display.
  CurrencyIcon = [ new ui.Binding<StoreImage>(BlankImage), new ui.Binding<StoreImage>(BlankImage), new ui.Binding<StoreImage>(BlankImage), new ui.Binding<StoreImage>(BlankImage) ]
  CurrencyTypeCount = new ui.Binding<number>(0)

  // Binding to control the overall visibility of the store UI.
  storeVisibility = new ui.Binding<boolean>(false)

  // ******************************************************************************************************************************
  
  // Array to store item IDs for quick lookup.
  storeIdRef: Array<string> = []


  // ******************************************************************************************************************************

  // Audio gizmos for hover and click sounds.
  hoverSound: hz.AudioGizmo | undefined = undefined
  clickSound: hz.AudioGizmo | undefined = undefined

  /**
   * Called when the component starts. It registers the store entity and initializes sounds.
   */
  start() {
    StoreEntityRegistry.set(this.entity.id, this)
    this.hoverSound = this.props.hoverSound?.as(hz.AudioGizmo)
    this.clickSound = this.props.clickSound?.as(hz.AudioGizmo)
  }

  /**
   * Initializes and returns the complete UI tree for the storefront.
   * It uses UI bindings to dynamically show/hide parts of the UI.
   * @returns The root UINode of the storefront UI.
   */
  initializeUI(): ui.UINode
  {
    // Generates UI nodes for all items in the store.
    let items: ui.UINode[] = []
    for(let i = 0; i < this.StoreItems.length; i++)
    {
      items.push(this.itemButton(this.StoreItems[i], this.CurrencyList))
    }
    return ui.View({
      // Main container view that controls the visibility of the entire store UI.
      style: {
        left: 0, top: 0, width: this.panelWidth, height: this.panelHeight,
        justifyContent: 'center',
        display: this.storeVisibility.derive(v => v ? 'flex' : 'none'),
      },
      children: ui.View({
        // Inner container for the store's main layout.
        children: [
          // Store Title section.
          ui.View({
            children: this.storeName(),
            style: {
              display: this.VisibleTab.derive(v => (this.TitleStyle.tabNo == -1 || this.TitleStyle.tabNo == v) ? 'flex' : 'none'),
              flexDirection: 'column', overflow: 'hidden', position: 'absolute',
              left: this.TitleStyle.size.left, top: this.TitleStyle.size.top, width: this.TitleStyle.size.width, height: this.TitleStyle.size.height,
            }
          }),
          // Currency Bar section.
          ui.View({
            children: this.currencyBar(),
            style: {
              display: this.VisibleTab.derive(v => (this.CurrencyStyle.tabNo == -1 || this.CurrencyStyle.tabNo == v) ? 'flex' : 'none'),
              flexDirection: 'column', overflow: 'hidden', position: 'absolute',
              left: this.CurrencyStyle.size.left, top: this.CurrencyStyle.size.top, width: this.CurrencyStyle.size.width, height: this.CurrencyStyle.size.height,
            }
          }),
          // Inventory section displaying the item list.
          ui.View({
            children: items,
            style: {
              display: this.VisibleTab.derive(v => (this.InventoryStyle.tabNo == -1 || this.InventoryStyle.tabNo == v) ? 'flex' : 'none'),
              flexDirection: 'row', overflow: 'hidden', position: 'absolute', flexWrap: 'wrap',
              left: this.InventoryStyle.size.left, top: this.InventoryStyle.size.top, width: this.InventoryStyle.size.width, height: this.InventoryStyle.size.height,
            },
          }),
          // Item Details section.
          ui.View({
            children: this.itemDetails(this.StoreItemDetails, this.CurrencyList),
            style:
            {
              display: this.VisibleTab.derive(v => (this.DetailStyle.tabNo == -1 || this.DetailStyle.tabNo == v) ? 'flex' : 'none'),
              flexDirection: 'column', overflow: 'hidden', position: 'absolute',
              left: this.DetailStyle.size.left, top: this.DetailStyle.size.top, width: this.DetailStyle.size.width, height: this.DetailStyle.size.height,
            }
          }),
        ],
        style:
        {
          flexDirection: 'row',
          position: 'absolute',
          left: this.storeSize.left, top: this.storeSize.top, width: this.storeSize.width, height: this.storeSize.height,
          backgroundColor: this.insetBackground,
          overflow: 'hidden',
        }
      })
    })
  }

  /**
   * Creates the UI element for the store's title.
   */
  storeName()
  {
    return ui.View({
      style: {
        width: this.TitleStyle.size.width, height: this.TitleStyle.size.height, position: 'absolute',
      },
      children: ui.View({
        style:
        {
          backgroundColor: this.storeNameBackground,
          borderColor: this.borderColor, borderRadius: this.borderRadius, borderWidth: this.borderWidth,
          left: this.TitleStyle.layout.left, top: this.TitleStyle.layout.top, width: this.TitleStyle.layout.width, height: this.TitleStyle.layout.height,
        },
        children: ui.Text({
          text: this.props.storeName,
          style:
          {
            fontSize: this.titleFontSize,
            fontFamily: this.titleFont,
            fontWeight: this.titleWeight,
            letterSpacing: this.titleSpacing,
            color: this.titleFontColor,
            textShadowColor: this.titleShadowColor, textShadowOffset: this.titleShadowOffset,
            textAlignVertical: 'center', marginLeft: 30,
          },
        }),
      })
    })
  }

  /**
   * Creates the UI element for the currency bar at the top right.
   */
  currencyBar()
  {
    return ui.View({
      style: {
        width: this.CurrencyStyle.size.width,
        height: this.CurrencyStyle.size.height,
        position: 'absolute',
      },
      children: ui.View({
        style:
        {
          backgroundColor: this.CurrencyStyle.layout.backgroundColor,
          borderColor: this.CurrencyStyle.layout.borderColor,
          borderRadius: this.CurrencyStyle.layout.borderRadius,
          borderWidth: this.CurrencyStyle.layout.borderWidth,
          left: this.CurrencyStyle.layout.left, top: this.CurrencyStyle.layout.top, width: this.CurrencyStyle.layout.width, height: this.CurrencyStyle.layout.height,
        },
        children: ui.View({
          style: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignContent: 'center',
          },
          children: [
            this.currencyElement(this.CurrencyList, 0),
            this.currencyElement(this.CurrencyList, 1),
            this.currencyElement(this.CurrencyList, 2),
            this.currencyElement(this.CurrencyList, 3),
          ],
        }),
      })
    })
  }

  /**
   * Creates an interactive button/slot for a single store item.
   * @param storeItem The binding for the item's data.
   * @param playerWallet The binding for the player's currency.
   */
  itemButton(storeItem: ui.Binding<ItemType>, playerWallet: ui.Binding<CurrencyType>)
  {
    let isHovered = new ui.Binding<boolean>(false)

    return ui.View({
      style: {
        // Hides the item button if its status is 'Hidden'.
        display: storeItem.derive(v => v.status == ItemStatus.Hidden ? 'none' : 'flex'),
        width: this.ItemStyle.size.width, height: this.ItemStyle.size.height,
      },
      children: ui.Pressable({
        style:
        {
          // Changes background color based on whether the item is selected.
          backgroundColor: ui.Binding.derive([storeItem, this.StoreSelectedItem], (i, s) => i.id == s ? this.itemSelectedBackground : this.itemBackground),
          // Changes border color on hover.
          borderColor: isHovered.derive(v => v ? hz.Color.white : this.ItemStyle.layout.borderColor),
          borderRadius: this.ItemStyle.layout.borderRadius,
          borderWidth: this.ItemStyle.layout.borderWidth,
          left: this.ItemStyle.layout.left, top: this.ItemStyle.layout.top, width: this.ItemStyle.layout.width, height: this.ItemStyle.layout.height,
        },
        children: ui.View({
          style: {
            flexDirection: 'column', alignContent: 'flex-start',
          },
          children: [
            ui.Text({
              text: storeItem.derive(v => v.name),
              style: {
                fontSize: this.itemFontSize, fontFamily: this.itemFont, letterSpacing: this.itemSpacing, fontWeight: this.itemWeight, color: this.itemFontColor,
                textShadowColor: this.itemShadowColor, textShadowOffset: this.itemShadowOffset,
                textAlign: 'center',
              }
            }),
            this.itemImageElement(storeItem),
            this.priceDisplay(storeItem, playerWallet, undefined, undefined, undefined),
          ],
        }),

        onEnter: (player: hz.Player) => {
          isHovered.set(true, [player])
          if(this.hoverSound)
          {
            this.hoverSound.play({ fade: 0, players: [player]})
          }
        },

        onExit: (player: hz.Player) => {
          isHovered.set(false, [player])
        },
        onClick: (player: hz.Player) => {
          // When clicked, updates the selected item and item details bindings.
          const id = storeItem.set((prev: ItemType) =>
          {
            this.StoreSelectedItem.set(prev.id, [player])
            this.StoreItemDetails.set(prev, [player])
            return prev
          }, [player])
          if(this.clickSound)
          {
            this.clickSound.play({ fade: 0, players: [player]})
          }
        }
      }),
    })
  }

  /**
   * Creates the UI element for the item detail panel.
   * @param storeItem The binding for the item's data.
   * @param playerWallet The binding for the player's currency.
   */
  itemDetails(storeItem: ui.Binding<ItemType>, playerWallet: ui.Binding<CurrencyType>)
  {
    return ui.View({
      style: {
        display: storeItem.derive(v => v.status == ItemStatus.Hidden ? 'none' : 'flex'),
        width: this.DetailStyle.size.width, height: this.DetailStyle.size.height,
      },
      children: ui.View({
        style:
        {
          backgroundColor: this.DetailStyle.layout.backgroundColor,
          borderColor: this.DetailStyle.layout.borderColor,
          borderRadius: this.DetailStyle.layout.borderRadius,
          borderWidth: this.DetailStyle.layout.borderWidth,
          left: this.DetailStyle.layout.left, top: this.DetailStyle.layout.top, width: this.DetailStyle.layout.width, height: this.DetailStyle.layout.height,
          flexDirection: 'column',
          justifyContent: 'flex-start',

        },
        children: [
          ui.Text({
            text: storeItem.derive(v => v.name),
            style: {
              fontSize: this.detailFontSize,
              fontFamily: this.detailFont,
              fontWeight: this.detailWeight,
              letterSpacing: this.detailSpacing,
              color: this.detailFontColor,
              textShadowColor: this.detailShadowColor, textShadowOffset: this.detailShadowOffset,
              textAlign: 'center',
            }
          }),
          this.itemImageElement(storeItem),
          ui.Text({
            text: storeItem.derive(v => v.description),
            style: {
              fontSize: this.detailFontSize,
              fontFamily: this.detailFont,
              fontWeight: this.detailWeight,
              letterSpacing: this.detailSpacing,
              color: this.detailFontColor,
              textShadowColor: this.detailShadowColor, textShadowOffset: this.detailShadowOffset,
              textAlign: 'left',
              left: this.insetSideMargin + this.margin, width: this.detailSize.width - this.insetSideMargin * 2 - this.margin * 4,
            }
          }),
          this.priceDisplay(storeItem, playerWallet, undefined, 330, 'absolute'),
          this.purchaseButton(storeItem),
        ],
      })
    })
  }

  /**

  /**
   * Creates a UI element for a single currency amount and its icon.
   * @param currency The binding for the currency data.
   * @param level The index of the currency type.
   * @param top Optional top position.
   */
  currencyElement(currency: ui.Binding<CurrencyType>, level: number, top: string | undefined = undefined)
  {
    return ui.View({
      children: [
        ui.Text({
          text: currency.derive(v => cleanNumberDisplay(v[level])),
          style: {
            fontSize: this.currencyFontSize,
            fontFamily: this.currencyFont,
            fontWeight: this.currencyWeight,
            letterSpacing: this.currencySpacing,
            color: this.currencyFontColor,
            textShadowColor: this.currencyShadowColor, textShadowOffset: this.currencyShadowOffset,
            paddingLeft: 20, paddingRight: 5,
          }
        }),
        ui.Image({
          source: this.CurrencyIcon[level].derive(v => v.image),
          style: {
            width: this.CurrencyIcon[level].derive(v => v.size.imageWidth),
            height: this.CurrencyIcon[level].derive(v => v.size.imageHeight),
          }
        }),
      ],
      style: {
        // Hides the element if the currency type count is less than the current level.
        display: this.CurrencyTypeCount.derive(v => v > level ? 'flex' : 'none'),
        flexDirection: 'row',
        alignItems: 'center',
        top: top,
      },
    })
  }

  /**
   * Creates the UI element for displaying an item's price.
   * @param storeItem The binding for the item.
   * @param playerWallet The binding for the player's currency.
   * @param left Optional left position.
   * @param top Optional top position.
   * @param position Optional CSS position type.
   */
  priceDisplay(storeItem: ui.Binding<ItemType>, playerWallet: ui.Binding<CurrencyType>,left: ui.DimensionValue | undefined, top: ui.DimensionValue | undefined, position: 'absolute' | 'relative' | undefined)
  {
    return ui.View({
      children: ui.View({
        style: {
          flexDirection: 'row',
          justifyContent: 'center',
          paddingLeft: 10, paddingRight: 10,
        },
        children: [
          this.priceElement(storeItem, playerWallet, 0, left, top),
          this.priceElement(storeItem, playerWallet, 1, left, top),
          this.priceElement(storeItem, playerWallet, 2, left, top),
          this.priceElement(storeItem, playerWallet, 3, left, top),
          this.priceFree(storeItem, left, top),
        ]
      }),
      style: {
        flexDirection: 'row',
        alignSelf: 'center',
        left: left, top: top,
        position: position,
      },
    })
  }

  /**
   * Creates a UI element for a single price currency and its icon.
   * Changes text color to red if the player can't afford it.
   * @param storeItem The binding for the item.
   * @param playerWallet The binding for the player's currency.
   * @param level The index of the currency type.
   * @param left Optional left position.
   * @param top Optional top position.
   */
  priceElement(storeItem: ui.Binding<ItemType>, playerWallet: ui.Binding<CurrencyType>, level: number, left: ui.DimensionValue | undefined, top: ui.DimensionValue | undefined)
  {
    return ui.View({
      children: [
        ui.Text({
          text: storeItem.derive(v => cleanNumberDisplay(v.price[level])),
          style: {
            fontSize: this.currencyFontSize,
            fontFamily: this.currencyFont,
            fontWeight: this.currencyWeight,
            letterSpacing: this.currencySpacing,
            // Changes font color to red if the player's currency is less than the item price.
            color: ui.Binding.derive([storeItem, playerWallet], (item, wallet) => item.price[level] > wallet[level] ? hz.Color.red : this.currencyFontColor),
            textShadowColor: this.currencyShadowColor, textShadowOffset: this.currencyShadowOffset,
            textAlign: 'center',
          }
        }),
        ui.Image({
          source: this.CurrencyIcon[level].derive(v => v.image),
          style: {
            width: this.CurrencyIcon[level].derive(v => v.size.imageWidth),
            height: this.CurrencyIcon[level].derive(v => v.size.imageHeight),
          }
        }),
      ],
      style: {
        // Hides the element if the price for this currency type is 0.
        display: storeItem.derive(item => item.price[level] > 0 ? 'flex':'none'),
        flexDirection: 'row',
        left: left, top: top,
        alignItems: 'center',
      },
    })
  }

  /**
   * Displays "Free" if the item's price is 0 for all currency types.
   */
  priceFree(item: ui.Binding<ItemType>, left: ui.DimensionValue | undefined, top: ui.DimensionValue | undefined)
  {
    return ui.View({
      children: [
        ui.Text({
          text: 'Free',
          style: {
            fontSize: this.currencyFontSize,
            fontFamily: this.currencyFont,
            fontWeight: this.currencyWeight,
            letterSpacing: this.currencySpacing,
            color: this.currencyFontColor,
            textShadowColor: this.currencyShadowColor, textShadowOffset: this.currencyShadowOffset,
            textAlign: 'center',
            paddingRight: 5,
          }
        }),
      ],
      style: {
        // Displays "Free" only if all price levels are zero.
        display: item.derive(v =>v.price[0] == 0 && v.price[1] == 0 && v.price[2] == 0 && v.price[3] == 0 ? 'flex':'none'),
        flexDirection: 'row',
        alignSelf: 'center',
        left: left, top: top,
      },
    })
  }

  /**
   * Creates the container for an item's image and status overlay.
   * @param storeItem The binding for the item.
   */
  itemImageElement(storeItem: ui.Binding<ItemType>)
  {
    return ui.View({
      style: {
        backgroundColor: this.ItemImageStyle.layout.backgroundColor,
        borderColor: this.ItemImageStyle.layout.borderColor,
        borderRadius: this.ItemImageStyle.layout.borderRadius,
        borderWidth: this.ItemImageStyle.layout.borderWidth,
        width: this.ItemImageStyle.layout.width, height: this.ItemImageStyle.layout.height,
        alignSelf: 'center',
      },
      children: [
        this.itemImage(storeItem),
      ]
    })
  }

  /**
   * Creates the UI elements for the main item image and the status overlay image.
   * @param storeItem The binding for the item.
   */
  itemImage(storeItem: ui.Binding<ItemType>)
  {
    return ui.View({
      style: {
        width: this.ItemImageStyle.layout.width, height: this.ItemImageStyle.layout.height,
      },
      children: [
        ui.Image({
          source: storeItem.derive(v => v.itemImage.image),
          style: {
            left: storeItem.derive(item => item.itemImage.x),
            top: storeItem.derive(item => item.itemImage.y),
            layoutOrigin: [0.5, 0.5],
            width: storeItem.derive(v => v.itemImage.size.imageWidth),
            height: storeItem.derive(v => v.itemImage.size.imageHeight),
            position: 'absolute',
            opacity: storeItem.derive(item => item.itemImage.opacity)
          }
        }),
        ui.Image({
          source: storeItem.derive(item => item.statusImages[item.status].image),
          style: {
            left: storeItem.derive(item => item.statusImages[item.status].x),
            top: storeItem.derive(item => item.statusImages[item.status].y),
            layoutOrigin: [0.5, 0.5],
            width: storeItem.derive(item => item.statusImages[item.status].size.imageWidth),
            height: storeItem.derive(item => item.statusImages[item.status].size.imageHeight),
            position: 'absolute',
            opacity: storeItem.derive(item => item.statusImages[item.status].opacity)
          }
        }),
        ui.Text({
          text: storeItem.derive(item => item.level > 0 ? (this.LevelLabel + item.level) : ''),
          style: {
            fontSize: this.itemFontSize,
            fontFamily: this.itemFont,
            fontWeight: this.itemWeight,
            letterSpacing: this.itemSpacing,
            color: this.itemFontColor,
            textShadowColor: this.itemShadowColor, textShadowOffset: this.itemShadowOffset,
            textAlign: 'center',
            alignSelf: 'center',
            position: 'absolute',
            top: Number(this.ItemImageStyle.layout.height) - 60,
          }
        })
      ]
    })
  }

  /**
   * Creates the interactive purchase button. Its appearance and function
   * are dynamically bound to the item's status.
   * @param storeItem The binding for the item.
   */
  purchaseButton(storeItem: ui.Binding<ItemType>)
  {
    let isHovered = new ui.Binding<boolean>(false)

    return ui.Pressable({
      children: ui.Text({
        // Sets the button label based on the item's status.
        text: storeItem.derive(item => this.PurchaseButton.label[item.status]),
        style: {
          fontSize: this.purchaseFontSize,
          fontFamily: this.purchaseFont,
          fontWeight: this.purchaseWeight,
          letterSpacing: this.purchaseSpacing,
          color: storeItem.derive(item => this.PurchaseButton.textColor[item.status]),
          textShadowColor: this.purchaseShadowColor, textShadowOffset: this.purchaseShadowOffset,
          textAlign: 'center',
        }
      }),
      style: {
        position: 'absolute',
        left: 50,
        top: this.detailSize.height - 110 - this.margin * 2,
        width: this.detailSize.width - 100,
        height: 90,
        // Changes background and border color on hover.
        backgroundColor: ui.Binding.derive([storeItem, isHovered], (item, hover) => { if(hover) { return(hz.Color.white) } else { return(this.PurchaseButton.color[item.status]) } }),
        gradientColorA: storeItem.derive(item => this.PurchaseButton.gradientA[item.status]),
        gradientColorB: storeItem.derive(item => this.PurchaseButton.gradientB[item.status]),
        gradientYa: 0.0, gradientYb: 1.0,
        borderColor: ui.Binding.derive([storeItem, isHovered], (item, hover) => { if(hover) { return(hz.Color.white) } else { return(this.PurchaseButton.color[item.status]) } }),
        borderRadius: 40, borderTopWidth: this.borderWidth, borderBottomWidth: this.borderWidth, borderLeftWidth: this.borderSideWidth, borderRightWidth: this.borderSideWidth,
        justifyContent: 'center'
      },

      onEnter: (player: hz.Player) => {
        isHovered.set(true, [player])
        if(this.hoverSound)
        {
          this.hoverSound.play({fade: 0, players: [player]})
        }
      },

      onExit: (player: hz.Player) => {
        isHovered.set(false, [player])
      },

      onRelease: (player: hz.Player) => {
        storeItem.set((item: ItemType) => {
          if(item.status != ItemStatus.Hidden)
          {
            // Sends the network event to the server to process the purchase.
            this.sendNetworkBroadcastEvent(playerPurchaseEvent, { storeId: this.entity.id, itemId: item.id, status: item.status, price: item.price, level: item.level, player: player})
          }
          return item
        }, [player])
        if(this.clickSound)
        {
          this.clickSound.play({ fade: 0, players: [player]})
        }
      }
    })
  }

  /**
   * Sets the visibility of the entire store UI for a specific player.
   * @param isReady True to show the UI, false to hide it.
   * @param player The player to apply the change to.
   */
  setReady(isReady: boolean, player: hz.Player)
  {
    this.storeVisibility.set(isReady, [player])
  }

  /**
   * Sets the currency icons and the number of currency types to display.
   * @param currencyIcons The currency definitions.
   * @param player The player to apply the change to.
   */
  setCurrencyIcons(currencyIcons: CurrencyDefsType, player: hz.Player)
  {
    for(let i = 0; i < currencyIcons.icons.length && i < MAX_CURRENCY; i++)
    {
      const iconCopy = {
        image: currencyIcons.icons[i].image,
        x: currencyIcons.icons[i].x,
        y: currencyIcons.icons[i].y,
        size: {
          imageWidth: currencyIcons.icons[i].size.imageWidth,
          imageHeight: currencyIcons.icons[i].size.imageHeight,
        },
        opacity: currencyIcons.icons[i].opacity,
      }
      this.CurrencyIcon[i].set(iconCopy, [player])
    }
    this.CurrencyTypeCount.set(currencyIcons.levels, [player])
  }

  /**
   * Updates the player's currency display.
   * @param wallet The new currency amounts.
   * @param player The player to apply the change to.
   */
  setPlayerCurrency(wallet: CurrencyType, player: hz.Player)
  {
    this.CurrencyList.set(wallet, [player])
  }

  /**
   * Updates the price of a specific item binding.
   * @param storeItem The item binding to update.
   * @param itemId The ID of the item.
   * @param price The new price.
   * @param player The player to apply the change to.
   */
  setItemPrice(storeItem: ui.Binding<ItemType>, itemId: string, price: CurrencyType, player: hz.Player)
  {
    storeItem.set((prev: ItemType) =>
    {
      if(prev.id == itemId)
      {
        prev.price = price
      }
      return prev
    }, [player])
  }

  /**
   * Updates the price of an item across the store's inventory and detail panel.
   * @param itemId The ID of the item.
   * @param price The new price.
   * @param player The player to apply the change to.
   */
  setStorePrice(itemId: string, price: CurrencyType, player: hz.Player)
  {
    for(let i = 0; i < this.StoreItems.length; i++)
    {
      if(this.storeIdRef[i] == itemId)
      {
        this.setItemPrice(this.StoreItems[i], itemId, price, player)
      }
    }
    this.setItemPrice(this.StoreItemDetails, itemId, price, player)
  }

  /**
   * Updates the level of a specific item binding.
   * @param storeItem The item binding to update.
   * @param itemId The ID of the item.
   * @param level The new level.
   * @param player The player to apply the change to.
   */
  setItemLevel(storeItem: ui.Binding<ItemType>, itemId: string, level: number, player: hz.Player)
  {
    storeItem.set((prev: ItemType) =>
    {
      if(prev.id == itemId)
      {
        prev.level = level
      }
      return prev
    }, [player])
  }

  /**
   * Updates the level of an item across the store's inventory and detail panel.
   * @param itemId The ID of the item.
   * @param level The new level.
   * @param player The player to apply the change to.
   */
  setStoreLevel(itemId: string, level: number, player: hz.Player)
  {
    for(let i = 0; i < this.StoreItems.length; i++)
    {
      if(this.storeIdRef[i] == itemId)
      {
        this.setItemLevel(this.StoreItems[i], itemId, level, player)
      }
    }
    this.setItemLevel(this.StoreItemDetails, itemId, level, player)
  }

  /**
   * Forces the UI to re-render the player's inventory.
   * @param player The player to apply the change to.
   */
  setPlayerInventory(player: hz.Player)
  {
    for(let i = 0; i < this.StoreItems.length; i++)
    {
      this.StoreItems[i].set((item: ItemType) => {
        return item
      }, [player])
    }
  }

  /**
   * Populates the store's inventory with a new list of items.
   * @param itemList The list of items to display.
   * @param player The player to apply the change to.
   */
  setStoreInventory(itemList: Array<ItemType>, player: hz.Player)
  {
    for(let i = 0; i < itemList.length && this.StoreItems.length; i++)
    {
      this.storeIdRef[i] = itemList[i].id
      this.StoreItems[i].set(itemList[i], [player])
    }
  }

  /**
   * Sets the first visible item as the selected item.
   * @param player The player to apply the change to.
   */
  setFirstVisibleActive(player: hz.Player)
  {
    let found = false
    for(let i = 0; i < this.StoreItems.length && !found; i++)
    {
      this.StoreItems[i].set((current: ItemType) =>
      {
        if(current.status != ItemStatus.Hidden)
        {
          found = true
          this.StoreSelectedItem.set(current.id, [player])
          this.StoreItemDetails.set(current, [player])
        }
        return current
      }, [player])
    }
  }

  /**
   * Updates the status of a specific item binding.
   * @param storeItem The item binding to update.
   * @param itemId The ID of the item.
   * @param startStatus The new status.
   * @param player The player to apply the change to.
   */
  setItemStatus(storeItem: ui.Binding<ItemType>, itemId: string, startStatus: ItemStatus, player: hz.Player)
  {
    storeItem.set((prev: ItemType) =>
    {
      if(prev.id == itemId)
      {
        let current = prev
        current.status = startStatus
        return current
      }
      return prev
    }, [player])
  }

  /**
   * Updates the status of an item across the store's inventory and detail panel.
   * @param itemId The ID of the item.
   * @param status The new status.
   * @param player The player to apply the change to.
   */
  setStoreItemStatus(itemId: string, status: ItemStatus, player: hz.Player)
  {
    for(let i = 0; i < this.StoreItems.length; i++)
    {
      if(this.storeIdRef[i] == itemId)
      {
        this.setItemStatus(this.StoreItems[i], itemId, status, player)
      }
    }
    this.setItemStatus(this.StoreItemDetails, itemId, status, player)
  }

  /**
   * Resets the status of a single item binding to its initial status.
   * @param storeItem The item binding to reset.
   * @param player The player to apply the change to.
   */
  resetItemStatus(storeItem: ui.Binding<ItemType>, player: hz.Player)
  {
    storeItem.set((prev: ItemType) =>
    {
      let current = prev
      current.status = current.startStatus
      return current
    }, [player])
  }

  /**
   * Resets the status of all items in the store to their initial status.
   * @param player The player to apply the change to.
   */
  resetStoreItemStatus(player: hz.Player)
  {
    for(let i = 0; i < this.StoreItems.length; i++)
    {
      this.resetItemStatus(this.StoreItems[i], player)
    }
    this.resetItemStatus(this.StoreItemDetails, player)
  }
}

// Registers the custom UI component with the game engine.
hz.Component.register(StoreFront_CUI)

// ====================================================================================================
// External functions for interacting with the StoreFront_CUI component from other parts of the game.
// These functions use the StoreEntityRegistry to find the correct instance of the component.
// ====================================================================================================

export function SetStoreReady(storeId: bigint, isVisible: boolean, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setReady(isVisible, player)
  }
}

export function SetStoreCurrency(storeId: bigint, currencyIcons: CurrencyDefsType, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setCurrencyIcons(currencyIcons, player)
  }
}

export function SetStoreInventory(storeId: bigint, itemList: Array<ItemType>, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setStoreInventory(itemList, player)
  }
}

export function ResetStoreStatus(storeId: bigint, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.resetStoreItemStatus(player)
  }
}

export function SetPlayerCurrency(storeId: bigint, currency: CurrencyType, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setPlayerCurrency(currency, player)
  }
}

export function SetItemStatus(storeId: bigint, itemId: string, startStatus: ItemStatus, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setStoreItemStatus(itemId, startStatus, player)
  }
}

export function SetFirstVisibleActive(storeId: bigint, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setFirstVisibleActive(player)
  }
}

export function SetItemPrice(storeId: bigint, itemId: string, currency: CurrencyType, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setStorePrice(itemId, currency, player)
  }
}

export function SetItemLevel(storeId: bigint, itemId: string, level: number, player: hz.Player)
{
  const storePtr = StoreEntityRegistry.get(storeId)
  if(storePtr && storePtr instanceof StoreFront_CUI)
  {
    storePtr.setStoreLevel(itemId, level, player)
  }
}
