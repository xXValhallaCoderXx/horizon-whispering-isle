/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Component, Player } from 'horizon/core';
import { UINode } from 'horizon/ui';
import { UIRoot_InteractionBlocking } from 'UIRoot_InteractionBlocking';
import { UIRoot_InteractionNonBlocking } from 'UIRoot_InteractionNonBlocking';
import { UIRoot_InteractionNonBlocking2 } from 'UIRoot_InteractionNonBlocking2';
import { UIRoot_InteractionNonBlocking3 } from 'UIRoot_InteractionNonBlocking3';
import { UIRoot_NoInteraction } from 'UIRoot_NoInteraction';

export abstract class UIRoot_ChildrenBase {
  protected uiRoot!: Component;
  protected localPlayer!: Player;
  protected serverPlayer!: Player;

  start() {

  }

  constructor(uiRoot: Component) {
    this.uiRoot = uiRoot;
    this.localPlayer = this.uiRoot.world.getLocalPlayer();
    this.serverPlayer = this.uiRoot.world.getServerPlayer();
  }

  abstract createView(): UINode;
}

export abstract class UIView_InteractionBlockingBase extends UIRoot_ChildrenBase {
  protected uiRootBlocking!: UIRoot_InteractionBlocking;
  protected props;

  constructor(uiRoot: UIRoot_InteractionBlocking) {
    super(uiRoot);
    this.uiRootBlocking = uiRoot;
    this.props = this.uiRootBlocking.props;
  }
}

export abstract class UIView_InteractionNonBlockingBase extends UIRoot_ChildrenBase {
  protected uiRootNonBlocking!: UIRoot_InteractionNonBlocking;
  protected props;

  constructor(uiRoot: UIRoot_InteractionNonBlocking) {
    super(uiRoot);
    this.uiRootNonBlocking = uiRoot;
    this.props = this.uiRootNonBlocking.props;
  }
}

export abstract class UIView_NoInteractionBase extends UIRoot_ChildrenBase {
  protected uiRootNoInteraction!: UIRoot_NoInteraction;
  protected props;

  constructor(uiRoot: UIRoot_NoInteraction) {
    super(uiRoot);
    this.uiRootNoInteraction = uiRoot;
    this.props = this.uiRootNoInteraction.props;
  }
}

export abstract class UIView_InteractionNonBlocking2Base extends UIRoot_ChildrenBase {
  protected uiRootNonBlocking!: UIRoot_InteractionNonBlocking2;
  protected props;

  constructor(uiRoot: UIRoot_InteractionNonBlocking2) {
    super(uiRoot);
    this.uiRootNonBlocking = uiRoot;
    this.props = this.uiRootNonBlocking.props;
  }
}

export abstract class UIView_InteractionNonBlocking3Base extends UIRoot_ChildrenBase {
  protected uiRootNonBlocking!: UIRoot_InteractionNonBlocking3;
  protected props;

  constructor(uiRoot: UIRoot_InteractionNonBlocking3) {
    super(uiRoot);
    this.uiRootNonBlocking = uiRoot;
    this.props = this.uiRootNonBlocking.props;
  }
}
