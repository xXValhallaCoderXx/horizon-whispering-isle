/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { HUDElementType, marketingUIElementTypes } from "Enums";
import { Events } from "Events";
import { Color, Component, Player } from "horizon/core";
import { AnimatedBinding, AnimatedInterpolation, Animation, Bindable, Binding } from "horizon/ui";
import { MARKETING_UI } from "PVarConsts";

abstract class HUDElementVisibilityTrackerBase {
  protected localPlayer?: Player;
  protected hudElementType: HUDElementType;
  private hiddenContexts = new Array<string>();
  protected onSetVisible: VisibleDelegate | undefined = undefined;

  constructor(hudElementType: HUDElementType, onSetVisible?: VisibleDelegate) {
    this.hudElementType = hudElementType;
    this.onSetVisible = onSetVisible;
  }

  connect(owner: Component<any>) {
    this.localPlayer = owner.world.getLocalPlayer();
    owner.connectLocalBroadcastEvent(Events.localShowHUD, payload => this.onShowHUD(payload.context));
    owner.connectLocalBroadcastEvent(Events.localHideHUD, payload => this.onHideHUD(payload.context, payload.exclude));
  }

  protected abstract setVisible(visible: boolean): void;

  private onShowHUD(context: string): void {
    const index = this.hiddenContexts.indexOf(context);
    if (index < 0) {
      return;
    }
    this.hiddenContexts.splice(index, 1);
    if (this.hiddenContexts.length === 0) {
      if (!MARKETING_UI || (this.hudElementType & marketingUIElementTypes)) {
        this.setVisible(true);
      }

    }
  }

  private onHideHUD(context: string, exclude?: HUDElementType): void {
    if (exclude && (exclude & this.hudElementType) > 0) {
      return;
    }
    if (this.hiddenContexts.indexOf(context) >= 0) {
      return;
    }
    this.hiddenContexts.push(context);
    if (this.hiddenContexts.length === 1) {
      this.setVisible(false);
    }
  }
}

export class HUDElementVisibilityTracker extends HUDElementVisibilityTrackerBase {
  private hudElementVisible = new Binding(true);

  constructor(hudElementType: HUDElementType, onSetVisible?: VisibleDelegate) {
    super(hudElementType, onSetVisible);

    if (MARKETING_UI && (this.hudElementType & marketingUIElementTypes) === 0) {
      this.hudElementVisible.set(false);
    }
  }

  isVisible(): Bindable<boolean> {
    return this.hudElementVisible;
  }

  disableInput(): Bindable<boolean> {
    return this.hudElementVisible.derive(value => !value);
  }

  protected setVisible(visible: boolean): void {
    this.hudElementVisible.set(visible, [this.localPlayer!]);
    if (this.onSetVisible !== undefined) {
      this.onSetVisible(visible);
    }
  }
}

type AnimationDelegate = (isShown: boolean) => Animation;
type VisibleDelegate = (isShown: boolean) => void;

export class AnimatedHUDElementVisibilityTracker extends HUDElementVisibilityTrackerBase {
  private hudElementScale = new AnimatedBinding(1);
  private hudElementActive = new Binding(true);
  private animationDelegate: AnimationDelegate;

  constructor(hudElementType: HUDElementType, animationDelegate: AnimationDelegate, onSetVisible?: VisibleDelegate) {
    super(hudElementType);
    this.animationDelegate = animationDelegate;
    this.onSetVisible = onSetVisible;

    if (MARKETING_UI && (this.hudElementType & marketingUIElementTypes) === 0) {
      this.hudElementScale.set(0);
      this.hudElementActive.set(false);
    }
  }

  isActive(): Bindable<boolean> {
    return this.hudElementActive;
  }

  disableInput(): Bindable<boolean> {
    return this.hudElementActive.derive(value => !value);
  }

  interpolate<T extends number | string | Color>(range: Array<T>): AnimatedInterpolation<T> {
    return this.hudElementScale.interpolate([0, 1], range);
  }

  protected setVisible(visible: boolean): void {
    this.hudElementActive.set(false, [this.localPlayer!]);
    this.hudElementScale.stopAnimation([this.localPlayer!]);
    this.hudElementScale.set(this.animationDelegate(visible), () => {
      if (visible) {
        this.hudElementActive.set(true, [this.localPlayer!]);
      }
      if (this.onSetVisible !== undefined) {
        this.onSetVisible(visible);
      }
    }, [this.localPlayer!]);
  }
}
