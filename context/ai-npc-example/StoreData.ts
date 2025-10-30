import * as hz from 'horizon/core'
import * as ui from 'horizon/ui'
import {  
          StoreImage, 
          ItemType,
          imageInfo,
          BlankImage, 
          ItemStatus,
          CurrencyDefsType} from 'StoreTypes'

export type ItemMetaData =
{
  type: 'attach' | 'grab' | 'stats' | 'upgrade' // types to handle for metaData
  toolId: string // name of item
  unlockCondition: Array<string> // name of tool the player must have to unlock this item
}

const centerx = 240
const centery = 123

// Note: Images (except for currency icons) are drawn using the center point and at the absolute position specified in their ui.View so they can stack
// Pickaxes
const greenPickaxe: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1298487625159089'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
const bluePickaxe: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1665122087505346'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
const purplePickaxe: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1953995828734435'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
const redPickaxe: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('2512881772406880'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
// Pickaxe Upgrades
const greenPickaxeUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('2637434589970334'))), x: centerx, y: centery - 10, size: { imageWidth: 340, imageHeight: 230 }, opacity: 1.0 }
const bluePickaxeUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('725697850379616'))), x: centerx, y: centery - 10, size: { imageWidth: 340, imageHeight: 230 }, opacity: 1.0 }
const purplePickaxeUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1211697717312992'))), x: centerx, y: centery - 10, size: { imageWidth: 340, imageHeight: 230 }, opacity: 1.0 }
const redPickaxeUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1646882046008245'))), x: centerx, y: centery - 10, size: { imageWidth: 340, imageHeight: 230 }, opacity: 1.0 }
// Backpacks
const smallBackpack: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1092577255720504'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
const mediumBackpack: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1096340652048699'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
const largeBackpack: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('773548781884350'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
const collosalBackpack: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('24653359460928114'))), x: centerx, y: centery, size: { imageWidth: 200, imageHeight: 200 }, opacity: 1.0 }
// Conversion Upgrades
const greenUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('4096326437269286'))), x: centerx, y: centery, size: { imageWidth: 280, imageHeight: 200 }, opacity: 1.0 }
const blueUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('765688472874003'))), x: centerx, y: centery, size: { imageWidth: 280, imageHeight: 200 }, opacity: 1.0 }
const purpleUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('779949771140335'))), x: centerx, y: centery, size: { imageWidth: 280, imageHeight: 200 }, opacity: 1.0 }
const redUpgrade: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1058132446300237'))), x: centerx, y: centery, size: { imageWidth: 280, imageHeight: 200 }, opacity: 1.0 }
// Item Status icons
const upArrow: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('2110256629444123'))), x: centerx + 190, y: centery - 80, size: { imageWidth: 80, imageHeight: 70 }, opacity: 1.0 }
const redPlus: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1378446136702580'))), x: centerx + 190, y: centery - 80, size: { imageWidth: 100, imageHeight: 100 }, opacity: 1.0 }
const ownedIcon: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1131880322090905'))), x: centerx, y: centery, size: { imageWidth: 350, imageHeight: 250 }, opacity: 1.0 }
const lockedIcon: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1129737429202646'))), x: centerx, y: centery, size: { imageWidth: 350, imageHeight: 250 }, opacity: 1.0 }
// Currency Icons
const currencyDisplaySize: imageInfo = { imageWidth: 45, imageHeight: 45 }
const green_currency: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('1801104863809383'))), x: 0, y: 0, size: currencyDisplaySize, opacity: 1.0 }
const blue_currency: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('749152410979129'))), x: 0, y: 0, size: currencyDisplaySize, opacity: 1.0 }
const purple_currency: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('3970934679785734'))), x: 0, y: 0, size: currencyDisplaySize, opacity: 1.0 }
const red_currency: StoreImage = { image: ui.ImageSource.fromTextureAsset(new hz.TextureAsset(BigInt('3967579660146937'))), x: 0, y: 0, size: currencyDisplaySize, opacity: 1.0 }

// How CurrencyDefs is used:
export const StoreCurrency: CurrencyDefsType =
{
  icons: [ green_currency, blue_currency, purple_currency, red_currency ],
  levels: 4,
}

// How ItemType is used:
/*
  id - a unique id (to each store only - doesn't matter if the same ID is used in different stores - they don't know about each other)
  slot - doesn't matter what this value is - this is set and used internally to each store
  name - the Item named displayed above the image inset
  description - this string is displayed only on the "Description Panel" below the image inset
  level - used for displaying an item level (optional - if 0, not displayed on the item inset)
  itemImage - to display on the image inset - important: images are displayed with the center of the picture at the x/y specified
  statusImages - (5) to display on the image inset - One for each ItemStatus value (Hidden is never drawn)
  price - (up to 4 levels) [ Green currency, Blue Currency, Purple Currency, Red Currency] - multiple currencies at once IS supported
  startStatus - starting status of the item (never changes)
  status - used internally by the store to track the current status of an item for each player
    Buyable - Displays "PURCHASE" on the button in the item detail screen
    Upgrade - Displays "UPGRADE" on the button in the item detail screen
    Owned - Displays "OWNED" on the button in the item detail screen
    Locked - Displays "LOCKED" on the button in the item detail screen
    Hidden - Hides the item from the store display (If hiding an item after the item has been visible - if it was selected - you will need to make another item selected)
  metaData - info specific to the game - the store doesn't look or care about this
    type - grab = a grabable item (pickaxe), attach = attachable item (backpack), upgrade = upgrade a tool, stats = update the stat for a given color (specify the color in toolId: GREEN, BLUE, PURPLE or RED) only supports 1 color at a time
    toolId - the item to be affected
    unlockConditions[] - a list of any toolId (type = grab or attach) that if owned - will change the status of this item to "Buyable"
*/
export const InventoryLists: Array<Array<ItemType>> = [
  // FTUE Store
  [
    { id: 'GP',
      name: 'Green Pickaxe', 
      description: 'This pickaxe is perfect for mining Green. Your first purchase.', 
      level: 0,
      itemImage: greenPickaxe,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 10, 0, 0, 0 ], startStatus: ItemStatus.Buyable, status: ItemStatus.Locked,
      metaData: { type: 'grab', toolId: 'GREEN_PICKAXE', unlockCondition: [] }, 
    }
  ],
  // Green Store
  [
    { id: 'GP',
      name: 'Green Pickaxe', 
      description: 'This pickaxe is perfect for mining Green. Your first purchase.', 
      level: 0,
      itemImage: greenPickaxe,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 10, 0, 0, 0 ], startStatus: ItemStatus.Buyable, status: ItemStatus.Locked,
      metaData: { type: 'grab', toolId: 'GREEN_PICKAXE', unlockCondition: [] },
    },
    { id: 'SB',
      name: 'Small Backpack', 
      description: 'This is a small backpack. You start with this.', 
      level: 0,
      itemImage: smallBackpack,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 10, 0, 0, 0 ], startStatus: ItemStatus.Buyable, status: ItemStatus.Locked,
      metaData: { type: 'attach', toolId: 'SMALL_BACKPACK', unlockCondition: [] },
    },
    { id: 'UGP',
      name: 'Upgrade Green Pickaxe', 
      description: 'This upgrade enhances the amount of progress per swing.', 
      level: 0,
      itemImage: greenPickaxeUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 5, 0, 0, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'upgrade', toolId: 'GREEN_PICKAXE', unlockCondition: [ 'GREEN_PICKAXE' ] },
    },
    { id: 'UGC',
      name: 'Upgrade Green Conversion', 
      description: 'This upgrade increases the conversion rate when turning in green ore.', 
      level: 10,
      itemImage: greenUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 10, 0, 0, 0 ], startStatus: ItemStatus.Upgrade, status: ItemStatus.Locked,
      metaData: { type: 'stats', toolId: 'GREEN', unlockCondition: [] }
    },
  ],
  // Blue Store
  [
    { id: 'BP',
      name: 'Blue Pickaxe', 
      description: 'This pickaxe is perfect for mining Blue.\nRequires:\n- Green Pickaxe', 
      level: 0,
      itemImage: bluePickaxe,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 0, 10, 0, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'grab', toolId: 'BLUE_PICKAXE', unlockCondition: ['GREEN_PICKAXE'] }
    },
    { id: 'MB',
      name: 'Medium Backpack', 
      description: 'This is a slightly larger backpack than the small one.\nRequires:\n- Small Backpack', 
      level: 0,
      itemImage: mediumBackpack,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 0, 10, 0, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'attach', toolId: 'MEDIUM_BACKPACK', unlockCondition: ['SMALL_BACKPACK'] }
    },
    { id: 'UBP', 
      name: 'Upgrade Blue Pickaxe', 
      description: 'This upgrade enhances the amount of progress per swing.', 
      level: 0,
      itemImage: bluePickaxeUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 0, 5, 0, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'upgrade', toolId: 'BLUE_PICKAXE', unlockCondition: [ 'BLUE_PICKAXE' ] }
    },
    { id: 'UBC',
      name: 'Upgrade Blue Conversion', 
      description: 'This upgrade increases the conversion rate when turning in blue ore.', 
      level: 10,
      itemImage: blueUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 0, 10, 0, 0 ], startStatus: ItemStatus.Upgrade, status: ItemStatus.Locked,
      metaData: { type: 'stats', toolId: 'BLUE', unlockCondition: [] }
    },
  ],
  // Purple Store
  [
    { id: 'PP',
      name: 'Purple Pickaxe', 
      description: 'This pickaxe is perfect for mining Purple.\nRequires:\n- Blue Pickaxe',
      itemImage: purplePickaxe,
      level: 0,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 0, 0, 10, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'grab', toolId: 'PURPLE_PICKAXE', unlockCondition: ['BLUE_PICKAXE'] }
    },
    { id: 'LB',
      name: 'Large Backpack', 
      description: 'This is a large backpack. Bigger than the medium one.\nRequires:\n- Medium Backpack', 
      level: 0,
      itemImage: largeBackpack,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 0, 0, 10, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'attach', toolId: 'LARGE_BACKPACK', unlockCondition: ['MEDIUM_BACKPACK'] }
    },
    { id: 'UPP',
      name: 'Upgrade Purple Pickaxe', 
      description: 'This upgrade enhances the amount of progress per swing.', 
      level: 0,
      itemImage: purplePickaxeUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 0, 0, 5, 0 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'upgrade', toolId: 'PURPLE_PICKAXE', unlockCondition: [ 'PURPLE_PICKAXE' ] }
    },
    { id: 'UPC',
      name: 'Upgrade Purple Conversion', 
      description: 'This upgrade increases the conversion rate when turning in purple ore.', 
      level: 10,
      itemImage: purpleUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 0, 0, 10, 0 ], startStatus: ItemStatus.Upgrade, status: ItemStatus.Locked,
      metaData: { type: 'stats', toolId: 'PURPLE', unlockCondition: [] }
    },
],
  // Red Store
  [
    { id: 'RP', 
      name: 'Red Pickaxe', 
      description: 'This pickaxe is perfect for mining Red.\nRequires:\n- Purple Pickaxe',
      level: 0,
      itemImage: redPickaxe,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 0, 0, 0, 10 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'grab', toolId: 'RED_PICKAXE', unlockCondition: ['PURPLE_PICKAXE'] }
    },
    { id: 'CB',
      name: 'Colossal Backpack', 
      description: 'This is the biggest backpack of them all.\nRequires:\n- Large Backpack', 
      level: 0,
      itemImage: collosalBackpack,
      statusImages: [ BlankImage, BlankImage, ownedIcon, lockedIcon, BlankImage ], 
      price: [ 0, 0, 0, 10 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'attach', toolId: 'COLOSSAL_BACKPACK', unlockCondition: ['LARGE_BACKPACK'] }
    },
    { id: 'URP',
      name: 'Upgrade Red Pickaxe', 
      description: 'This upgrade enhances the amount of progress per swing.', 
      level: 0,
      itemImage: redPickaxeUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 0, 0, 0, 5 ], startStatus: ItemStatus.Locked, status: ItemStatus.Locked,
      metaData: { type: 'upgrade', toolId: 'RED_PICKAXE', unlockCondition: [ 'RED_PICKAXE' ] }
    },
    { id: 'URC',
      name: 'Upgrade Red Conversion', 
      description: 'This upgrade increases the conversion rate when turning in red ore.', 
      level: 10,
      itemImage: redUpgrade,
      statusImages: [ BlankImage, BlankImage, BlankImage, lockedIcon, BlankImage ], 
      price: [ 0, 0, 0, 10 ], startStatus: ItemStatus.Upgrade, status: ItemStatus.Locked,
      metaData: { type: 'stats', toolId: 'RED', unlockCondition: [] }
    },
  ],
]
