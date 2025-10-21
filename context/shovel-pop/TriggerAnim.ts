/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import * as hz from 'horizon/core';

class TriggerAnim extends hz.Component<typeof TriggerAnim> {
    static propsDefinition = {
        anim: {type: hz.PropTypes.Asset},
    };

    start() {
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player: hz.Player) => {
            // trigger a UGC animation that loops forever at 2x speed
            player.playAvatarAnimation(this.props.anim!, { looping: true, playRate: 1 });
        });
        this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerExitTrigger, this.stopAnimation.bind(this));
    }
    stopAnimation(player: hz.Player) {
        player.stopAvatarAnimation();
    }
}
hz.Component.register(TriggerAnim);
