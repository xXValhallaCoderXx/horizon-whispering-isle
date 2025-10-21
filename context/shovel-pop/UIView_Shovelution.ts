/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from 'Events';
import { AudioGizmo, Color, LocalEvent } from 'horizon/core';
import { AnimatedBinding, Animation, Binding, Easing, Image, ImageSource, Pressable, Text, UINode, View } from 'horizon/ui';
import { Shovel } from 'Shovel';
import { UIView_InteractionBlockingBase } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionBlocking } from 'UIRoot_InteractionBlocking';

export class ShovelutionEvents{
  static play = new LocalEvent<{ id: string, level: number }>('play')
  static end = new LocalEvent<{}>('end')
}

const BG_FADE = 0.5 * 1000
const SHOVEL_RISE = 0.5 * 1000
const SET_SHOVEL_TEXT_DELAY = BG_FADE + SHOVEL_RISE + 0.3 * 1000
const STARBURST_DELAY = 0.5 * 1000
const STARBURST_GROW = 1 * 1000
const LIGHTWIPE_DELAY = 1 * 1000
const LIGHTWIPE_TIME = 1.5 * 1000
const EVOLVE_TEXT_DELAY = 1 * 1000
const CONTINUE_BUTTON_DELAY = 1.5 * 1000

const CLEAR_TIME = 0.5 * 1000

const STARBURST_RPM = 3 * 1000

export class UIView_Shovelution extends UIView_InteractionBlockingBase {
  private bgOpacity = new AnimatedBinding(0)

  private image: Binding<ImageSource>
  private imageY = new AnimatedBinding(0)
  private imageScale = new AnimatedBinding(1)

  private text: Binding<string> = new Binding<string>('')
  private textColor = new Binding<Color>(Color.white)

  private lightWipe = new AnimatedBinding(0)

  private starburstScale = new AnimatedBinding(0)
  private starburstRotation = new AnimatedBinding(0)

  private continueButtonVisible = new Binding(false)

  constructor(uiRoot: UIRoot_InteractionBlocking) {
    super(uiRoot)

    this.image = new Binding(ImageSource.fromTextureAsset(this.props.shovelInventory_arrow!))
    this.uiRoot.connectLocalBroadcastEvent(ShovelutionEvents.play, (data)=> this.play(data.id, data.level))
  }

  play(previousShovelId: string, level: number){
    const prevData = Shovel.getData(previousShovelId, level)!
    const evolvedData = Shovel.getData(prevData.evolution, 0)
    const baseData = Shovel.getData(prevData.baseShovel, 0) ?? prevData;

    if (!evolvedData){
      console.error('No evolved data for ' + prevData.name, 'Why are you trying to evolve this?')
      return
    }

    const target = [this.localPlayer]

    this.image.set(ImageSource.fromTextureAsset(prevData.getIconAsset()!), target)
    this.text.set('', target)
    this.textColor.set(Color.white, target)
    this.starburstRotation.set(0, undefined, target)
    this.starburstScale.set(0, undefined, target)
    this.props.shovelution_sfx?.as(AudioGizmo).play({
      fade: 0,
      players: target
    })

    this.uiRootBlocking.setVisibility(true)
    this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context: 'shovelution' });

    this.bgOpacity.set(Animation.sequence(
      Animation.timing(0, { duration: 0 }),
      Animation.timing(0.8, { duration: BG_FADE, })
    ), undefined, target)

    this.imageY.set(Animation.delay(BG_FADE,
      Animation.sequence(
        Animation.timing(0, { duration: 0 }),
        Animation.timing(1, { duration: SHOVEL_RISE, easing: Easing.out(Easing.ease)})
    )), undefined, target)

    this.uiRoot.async.setTimeout(()=> this.text.set('Something is happening to ' + prevData.name + ' Shovel...', target), SET_SHOVEL_TEXT_DELAY)

    this.starburstScale.set(Animation.delay(SET_SHOVEL_TEXT_DELAY + STARBURST_DELAY,
      Animation.sequence(
        Animation.timing(0, { duration: 0 }),
        Animation.timing(1, { duration: STARBURST_GROW, easing: Easing.out(Easing.ease)})
    )), undefined, target)

    this.starburstRotation.set(Animation.delay(SET_SHOVEL_TEXT_DELAY + STARBURST_DELAY,
      Animation.repeat(Animation.timing(1, { duration: STARBURST_RPM, easing: Easing.linear }), -1)), undefined, target)

    this.uiRoot.async.setTimeout(()=> {
      this.text.set('', target)
      this.image.set(ImageSource.fromTextureAsset(evolvedData.getIconAsset()!), target)
      this.imageScale.set(1.5, undefined, target)
      this.starburstScale.set(Animation.sequence(
        Animation.timing(2, { duration: 0 }),
        Animation.timing(1, { duration: STARBURST_GROW, easing: Easing.out(Easing.ease)})
      ), undefined, target)
    },
    SET_SHOVEL_TEXT_DELAY + STARBURST_DELAY + STARBURST_GROW + LIGHTWIPE_DELAY + (LIGHTWIPE_TIME / 2))

    this.lightWipe.set(Animation.delay(SET_SHOVEL_TEXT_DELAY + STARBURST_DELAY + STARBURST_GROW + LIGHTWIPE_DELAY,
      Animation.sequence(
        Animation.timing(0, { duration: 0 }),
        Animation.timing(1, { duration: LIGHTWIPE_TIME / 2, }),
        Animation.timing(0, { duration: LIGHTWIPE_TIME / 2, })
    )), undefined, target)

    this.uiRoot.async.setTimeout(()=> {
      this.text.set(`${baseData.name} Shovel has evolved!`, target)
      this.textColor.set(Color.fromHex('#ffa500'), target)
    },
    SET_SHOVEL_TEXT_DELAY + STARBURST_DELAY + STARBURST_GROW + LIGHTWIPE_DELAY + LIGHTWIPE_TIME + EVOLVE_TEXT_DELAY)

    this.uiRoot.async.setTimeout(()=> {
      this.continueButtonVisible.set(true, target)
    },
    SET_SHOVEL_TEXT_DELAY + STARBURST_DELAY + STARBURST_GROW + LIGHTWIPE_DELAY + LIGHTWIPE_TIME + EVOLVE_TEXT_DELAY + CONTINUE_BUTTON_DELAY)
  }

  onContinuePressed(){
    const target = [this.localPlayer]

    this.continueButtonVisible.set(false, target)
    this.text.set('', target)

    this.starburstScale.set(Animation.sequence(
      Animation.timing(0, { duration: CLEAR_TIME, easing: Easing.out(Easing.ease) }),
    ), undefined, target)

    // this.bgOpactiy.set(Animation.sequence(
    //   Animation.timing(0, { duration: CLEAR_TIME, easing: Easing.out(Easing.ease) }),
    // ), undefined, target)

    this.imageY.set(Animation.sequence(
      Animation.timing(0, { duration: CLEAR_TIME, easing: Easing.out(Easing.ease) }),
    ), () => {
      this.uiRootBlocking.setVisibility(false)
      this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context: 'shovelution' });
      this.uiRoot.sendLocalBroadcastEvent(ShovelutionEvents.end, {})
      this.starburstRotation.set(0, undefined, target)
      this.bgOpacity.set(0, undefined, target)
    }, target)
  }

  createView(): UINode {
    const bg = View({
      style:{
        width: '101%',
        height: '101%',
        backgroundColor: '#000000',
        opacity: this.bgOpacity,
      }
    })

    const starburst = Image({
      source: ImageSource.fromTextureAsset(this.props.fanfare_sunburst!),
      style:{
        width: 256,
        height: 256,
        transform: [
          { rotate: this.starburstRotation.interpolate([0, 1], ['0deg', '360deg']) },
          { scale: this.starburstScale.interpolate([0, 1, 2], [0, 1.5, 5]) },
        ],
        position: 'absolute',
        alignSelf: 'center',
        bottom: '25%',
        opacity: 0.9,
      }
    })

    const shovelIcon = Image({
      source: this.image,
      style:{
        width: 256,
        height: 256,
        transform: [
          { translateY: this.imageY.interpolate([0, 1], [700, 175]) },
          { scale: this.imageScale }
        ],
        position: 'absolute',
        alignSelf: 'center',
      }
    })

    const text = Text({
      text: this.text,
      style:{
        fontSize: 30,
        fontWeight: '900',
        textShadowColor: 'black',
        textShadowOffset: [2, 3],
        color: this.textColor,
        textAlign: 'center',
        position: 'absolute',
        alignSelf: 'center',
        bottom: '16%'
      }
    })

    const continueButton = Pressable({
      children: [
        Text({
          text: 'Continue',
          style: {
            color: "white",
            textAlign: 'center',
            fontSize: 30,
            fontFamily: 'Roboto',
            fontWeight: '700',
            textShadowColor: 'black',
            textShadowOffset: [2, 3],
          },
        }),
      ],
      style: {
        position: 'absolute',
        borderRadius: 16,
        borderWidth: 3.5,
        height: 48,
        width: 180,
        justifyContent: 'center',
        alignContent: 'center',
        backgroundColor: '#bdeaad',
        borderColor: '#72d753',
        alignSelf: 'center',
        bottom: '6%',
      },
      onClick: () => this.onContinuePressed(),
    })

    const tapAnywhere = Pressable({
      children: [
        View({
          children: [
            Text({
              text: 'tap anywhere to continue',
              style: {
                color: "white",
                textAlign: 'center',
                fontSize: 30,
                fontFamily: 'Roboto',
                fontWeight: '700',
                textShadowColor: 'black',
                textShadowOffset: [2, 3],
              },
            }),
          ],
          style: {
            position: 'absolute',
            justifyContent: 'center',
            alignContent: 'center',
            alignSelf: 'center',
            bottom: '6%',
          },
        })
      ],
      style: {
        width: '100%',
        height: '100%',
        position: 'absolute',
      },
      onClick: () => this.onContinuePressed(),
    });

    const lightWipe = View({
      style:{
        width: '101%',
        height: '101%',
        backgroundColor: 'white',
        opacity: this.lightWipe,
        position: 'absolute',
        zIndex: 1
      }
    })

    return View({
      children:[
        bg,
        starburst,
        shovelIcon,
        text,
        UINode.if(this.continueButtonVisible, tapAnywhere),
        lightWipe,
      ],
      style:{
        height: '100%',
        width: '100%',
      }
    })
  }
}
