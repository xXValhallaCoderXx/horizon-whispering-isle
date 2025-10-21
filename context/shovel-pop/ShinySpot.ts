/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as GameUtils from 'GameUtils';
import * as hz from 'horizon/core';
import { Player, Vec3 } from 'horizon/core';
import { ItemContainer } from 'ItemContainer';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { ShinySpotWorldData } from 'ShinySpotWorldData';

const log = new Logger("ShinySpot");

export const DEFAULT_SHINY_SPOT_POSITION: Vec3 = new Vec3(0, -100, 0);

const VFX_COLOR_PARAMETERS = [
  "shiny_color_hsv",
  "glow_color_hsv",
  "ring_color_hsv",
  "ray_color_hsv",
]

const VFX_OPACITY_PARAMETERS = [
  "shiny_opacity",
  "glow_opacity",
  "ring_opacity",
  "opacity",
]

const VFX_GLOW_SCALE_PARAMETERS = [
  "glow_scale",
]

const SHINY_COLOR_HSV: Map<string, Vec3>[] = [
  new Map([ // common
    ["shiny_color_hsv", new Vec3(0, 0, 3.5)],
    ["glow_color_hsv", new Vec3(0, 0, 2.5)],
    ["ring_color_hsv", new Vec3(0, 0, 2.5)],
    ["ray_color_hsv", new Vec3(0, 0, 3.2)]
  ]),
  new Map([ // uncommon
    ["shiny_color_hsv", new Vec3(0.35, 0.75, 3.5)],
    ["glow_color_hsv", new Vec3(0.35, 0.75, 2.5)],
    ["ring_color_hsv", new Vec3(0.35, 0.75, 2.5)],
    ["ray_color_hsv", new Vec3(0.35, 1, 3.2)]
  ]),
  new Map([ // rare
    ["shiny_color_hsv", new Vec3(0.55, 0.85, 4)],
    ["glow_color_hsv", new Vec3(0.55, 0.85, 2.5)],
    ["ring_color_hsv", new Vec3(0.55, 0.85, 2.5)],
    ["ray_color_hsv", new Vec3(0.55, 0.95, 3.2)]
  ]),
  new Map([ // epic
    ["shiny_color_hsv", new Vec3(0.7, 0.75, 3.5)],
    ["glow_color_hsv", new Vec3(0.7, 0.75, 2.5)],
    ["ring_color_hsv", new Vec3(0.7, 0.73, 2.5)],
    ["ray_color_hsv", new Vec3(0.7, 0.95, 3.2)]
  ]),
  new Map([ // legendary
    ["shiny_color_hsv", new Vec3(0.1, 0.75, 3.5)],
    ["glow_color_hsv", new Vec3(0.1, 0.75, 2.5)],
    ["ring_color_hsv", new Vec3(0.1, 0.85, 2.5)],
    ["ray_color_hsv", new Vec3(0.1, 0.95, 3.2)]
  ]),
  new Map([ // mythical
    ["shiny_color_hsv", new Vec3(0, 0.8, 4.5)],
    ["glow_color_hsv", new Vec3(0, 0.75, 2.5)],
    ["ring_color_hsv", new Vec3(0, 0.75, 2.5)],
    ["ray_color_hsv", new Vec3(0, 0.95, 3.2)]
  ]),
];

const SHINY_OPACITY_HSV: Map<string, number>[] = [
  new Map([ // common
    ["shiny_opacity", 1],
    ["glow_opacity", 0.45],
    ["ring_opacity", 1],
    ["opacity", 0.5]
  ]),
  new Map([ // uncommon
    ["shiny_opacity", 1],
    ["glow_opacity", 0.45],
    ["ring_opacity", 1],
    ["opacity", 0.65]
  ]),
  new Map([ // rare
    ["shiny_opacity", 1],
    ["glow_opacity", 0.45],
    ["ring_opacity", 1],
    ["opacity", 0.65]
  ]),
  new Map([ // epic
    ["shiny_opacity", 1],
    ["glow_opacity", 0.45],
    ["ring_opacity", 1],
    ["opacity", 0.65]
  ]),
  new Map([ // legendary
    ["shiny_opacity", 1],
    ["glow_opacity", 0.45],
    ["ring_opacity", 1],
    ["opacity", 0.65]
  ]),
  new Map([ // mythical
    ["shiny_opacity", 1],
    ["glow_opacity", 0.45],
    ["ring_opacity", 1],
    ["opacity", 0.65]
  ]),
];

const SHINY_GLOW_SCALE_HSV: Map<string, number>[] = [
  new Map([ // common
    ["glow_scale", 1],
  ]),
  new Map([ // uncommon
    ["glow_scale", 1],
  ]),
  new Map([ // rare
    ["glow_scale", 1],
  ]),
  new Map([ // epic
    ["glow_scale", 1],
  ]),
  new Map([ // legendary
    ["glow_scale", 1],
  ]),
  new Map([ // mythical
    ["glow_scale", 1],
  ]),
];

export class ShinySpot extends hz.Component<typeof ShinySpot> {
  static propsDefinition = {
    vfx: { type: hz.PropTypes.Entity },
  };

  static s_pool: hz.Entity[] = [];

  player!: Player;
  data?: ShinySpotWorldData;

  preStart() {
    ShinySpot.s_pool.push(this.entity);
  }

  start() { }

  setPlayer(player: Player) {
    this.player = player;
  }

  setup(data: ShinySpotWorldData) {
    if (this.data === data) {
      return;
    }
    this.clearData();
    this.data = data;
    this.entity.position.set(data.position);
    this.props.vfx!.position.set(data.position);
    const itemId = data.itemId;
    const item = ItemContainer.localInstance.getItemDataForId(itemId);
    const rarity = item?.rarity ?? 0;

    const color = hz.Color.fromHex(ItemUtils.RARITY_HEX_COLORS[rarity]).toHSV();
    this.props.vfx?.as(hz.ParticleGizmo).setVFXParameterValue("shiny_color_hsv", [color.x, color.y, color.z]);

    for (let i = 0; i < VFX_COLOR_PARAMETERS.length; i++) {
      const vfxParameter = VFX_COLOR_PARAMETERS[i];
      const color = SHINY_COLOR_HSV[rarity].get(vfxParameter)!;
      this.props.vfx?.as(hz.ParticleGizmo).setVFXParameterValue(vfxParameter, [color.x, color.y, color.z]);
    }

    for (let i = 0; i < VFX_OPACITY_PARAMETERS.length; i++) {
      const vfxParameter = VFX_OPACITY_PARAMETERS[i];
      const opacity = SHINY_OPACITY_HSV[rarity].get(vfxParameter)!;
      this.props.vfx?.as(hz.ParticleGizmo).setVFXParameterValue(vfxParameter, opacity);
    }

    for (let i = 0; i < VFX_GLOW_SCALE_PARAMETERS.length; i++) {
      const vfxParameter = VFX_GLOW_SCALE_PARAMETERS[i];
      const glowScale = SHINY_GLOW_SCALE_HSV[rarity].get(vfxParameter)!;
      this.props.vfx?.as(hz.ParticleGizmo).setVFXParameterValue(vfxParameter, glowScale);
    }

    this.playVFX();
    log.info(`set item id sending percentage changed ${itemId} ${rarity}`);
  }

  clearData() {
    if (this.data !== undefined) {
      this.data.shinySpotEffect = undefined;
      this.data = undefined;
    }
  }

  playVFX() {
    GameUtils.playVFXForPlayer(this.props.vfx!, this.player);
  }

  stopVFX() {
    GameUtils.stopVFXForPlayer(this.props.vfx!, this.player);
  }
}
hz.Component.register(ShinySpot);
