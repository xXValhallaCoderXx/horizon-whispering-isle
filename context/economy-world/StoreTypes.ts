import * as ui from 'horizon/ui'

/**
 * A type definition for Custom UI styles.
 */
export type CUIStyles =
{
  /**
   * Specifies which tab number this style is associated with.
   * A value of -1 indicates it's not tied to a specific tab.
   */
  tabNo: number
  /**
   * The size and position of the UI element within its parent container.
   */
  size: { left?: ui.DimensionValue, top?: ui.DimensionValue, width?: ui.DimensionValue, height?: ui.DimensionValue }
  /**
   * The styling properties for the UI view.
   */
  layout: ui.ViewStyle
}

/**
 * The maximum number of currency types supported, which is 4.
 */
export const MAX_CURRENCY = 4

/**
 * A tuple representing the player's currency amounts.
 * The order corresponds to the currency types (e.g., green, blue, purple, red).
 */
export type CurrencyType = [ number, number, number, number ]

/**
 * A type definition for currency-related data.
 */
export type CurrencyDefsType =
{
  /**
   * An array of images to be used as icons for each currency type.
   */
  icons: [ StoreImage, StoreImage, StoreImage, StoreImage ]
  /**
   * The number of currency levels to display.
   */
  levels: number
}

/**
 * A type definition for image dimensions.
 */
export type imageInfo =
{
  /**
   * The width to draw the image in pixels.
   */
  imageWidth: number
  /**
   * The height to draw the image in pixels.
   */
  imageHeight: number
}

/**
 * A type definition for an image used within the store UI.
 */
export type StoreImage =
{
  /**
   * The source of the image.
   */
  image: ui.ImageSource
  /**
   * The x-coordinate for the image position.
   */
  x: number
  /**
   * The y-coordinate for the image position.
   */
  y: number
  /**
   * The size of the image.
   */
  size: imageInfo
  /**
   * The opacity of the image, where 1 is fully opaque and 0 is fully transparent.
   */
  opacity: number
}

/**
 * An enumeration of the possible status states for a store item.
 */
export enum ItemStatus
{
  /**
   * The item can be purchased by the player.
   */
  Buyable = 0,
  /**
   * The item is an upgrade that can be purchased.
   */
  Upgrade,
  /**
   * The item is already owned by the player.
   */
  Owned,
  /**
   * The item is currently locked and cannot be purchased.
   */
  Locked,
  /**
   * The item is hidden from the player's view.
   */
  Hidden,
}

/**
 * A type definition for a store item.
 */
export type ItemType =
{
  /**
   * The unique identifier for the item within the store.
   */
  id: string
  /**
   * The name of the item, displayed at the top of the Item Panel View and Item Detail View.
   */
  name: string
  /**
   * A description of the item, displayed only on the Item Detail View.
   */
  description: string
  /**
   * The level of the item.
   */
  level: number
  /**
   * The image to be displayed for the item in the list view.
   */
  itemImage: StoreImage
  /**
   * An array of images corresponding to each possible status (e.g., Buyable, Owned).
   */
  statusImages: [ StoreImage, StoreImage, StoreImage, StoreImage, StoreImage ]
  /**
   * The price of the item, represented as a CurrencyType tuple.
   */
  price: CurrencyType
  /**
   * The initial status of the item when the store is loaded.
   */
  startStatus: ItemStatus
  /**
   * The current status of the item.
   */
  status: ItemStatus
  /**
   * Optional metadata for the item.
   */
  metaData?: ItemMetaData
}

/**
 * A type definition for metadata associated with a store item.
 */
export type ItemMetaData =
{
  /**
   * The type of the item (e.g., 'grab', 'attach', 'upgrade', 'stats').
   */
  type: 'grab' | 'attach' | 'upgrade' | 'stats'
  /**
   * The ID of the tool or stat associated with this item.
   */
  toolId: string
  /**
   * An array of item IDs that must be owned to unlock this item.
   */
  unlockCondition: string[]
}

/**
 * A type definition for a list of item data.
 */
export type InventoryList = Array<ItemType>

/**
 * A blank image object used as a placeholder.
 */
export const BlankImage: StoreImage = {
  image: new ui.ImageSource(),
  x: 0,
  y: 0,
  size: {
      imageWidth: 0,
      imageHeight: 0
  },
  opacity: 0,
}

/**
 * A type definition for a registry that maps store entity IDs to their StoreFront_CUI instances.
 */
export type StoreEntityRegistryType = Map<bigint, any>

/**
 * A registry to hold references to all active store entities.
 */
export const StoreEntityRegistry = new Map<bigint, any>()