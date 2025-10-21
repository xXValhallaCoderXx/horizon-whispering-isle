/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Events } from 'Events';
import { AnimatedBinding, Animation, Binding, ColorValue, Easing, Image, ImageSource, Pressable, Text, UIChildren, UINode, View } from 'horizon/ui';
import { ItemUtils } from 'ItemUtils';
import { Logger } from 'Logger';
import { PlayerInteractionTrigger } from 'PlayerInteractionTrigger';
import { HARDCODED_POTION_TUNING, POTION_BUNDLE_SIZE, PotionData } from 'PotionData';
import { missing_texture, UI_Utils } from 'UI_Utils';
import { UIView_InteractionNonBlocking2Base } from 'UIRoot_ChildrenBase';
import { UIRoot_InteractionNonBlocking2 } from 'UIRoot_InteractionNonBlocking2';

const log = new Logger("UIView_PotionGatcha");
const context = "potion_gatcha";
const DISPLAY_BUFFER_TIME = 500;
const BUNDLE_OPEN_TIME = 1000;
const NEWPOTIONTEXT_TO_POTION_DELAY = 500;

export class UIView_PotionGatcha extends UIView_InteractionNonBlocking2Base {
  isVisible: Binding<boolean> = new Binding<boolean>(false);
  potionViewModels: Array<PotionViewModel> = new Array<PotionViewModel>();
  potionTotalModels = new Array<PotionTotalViewModel>();
  continueVisible: Binding<boolean> = new Binding<boolean>(false);
  bundleRotation: AnimatedBinding = new AnimatedBinding(0);
  bundleIsVisible: Binding<boolean> = new Binding<boolean>(false);
  newPotionsTextVisible: Binding<boolean> = new Binding<boolean>(false);

  private readonly featuredTextSize = 36;
  private readonly outlineSizeMult = 0.075; // How large the text outline should be as a fraction of the font size

  private potionCount = 0;

  constructor(uiRoot: UIRoot_InteractionNonBlocking2) {
    super(uiRoot);
    this.localPlayer = uiRoot.world.getLocalPlayer();
    const target = [this.localPlayer];
    const missingTexture = missing_texture.getImage();
    this.uiRoot.connectNetworkBroadcastEvent(Events.givePotionBundle, (data) => {
      this.potionCount = data.potionCounts.reduce((acc, count) => acc + count, 0);
      for (let i = 0; i < HARDCODED_POTION_TUNING.length; i++) {
        let potionId = HARDCODED_POTION_TUNING[i].potionId;
        const potionImage = PotionData.getPotionImage(potionId) ?? missingTexture
        this.potionTotalModels[i].image.set(potionImage, target);
      }

      this.playBundleAnimation(data.potionCounts);
    });

    for (let i = 0; i < HARDCODED_POTION_TUNING.length; i++) {
      this.potionViewModels.push(new PotionViewModel(missingTexture));
      this.potionTotalModels.push(new PotionTotalViewModel(missingTexture));
    }
  }

  playBundleAnimation(potionCounts: number[]){
    const oscilationInterval = 200; // Interval for color change
    const oscilationDegrees = [-50, 50];
    let pulseIndex = 0;
    let target = [this.localPlayer];

    this.bundleIsVisible.set(true, target);
    const pulseAnimation = this.uiRoot.async.setInterval(() => {
      this.bundleRotation.set(Animation.timing(oscilationDegrees[pulseIndex], { duration: oscilationInterval, easing: Easing.linear }), undefined, target);
      pulseIndex = (pulseIndex + 1) % oscilationDegrees.length;
    }, oscilationInterval);

    this.newPotionsTextVisible.set(false, target);
    this.potionTotalModels.forEach((x, i) => {
      x.popAnimation.set(1, undefined, target)
      x.isVisible.set(false, target)
      x.text.set("x0", target)
      this.potionTotalModels[i].textBgColor.set(ItemUtils.RARITY_HEX_COLORS[i + 1], target)
    });
    this.continueVisible.set(false, target);

    const allPotions = this.getRandomizedPotionIds(potionCounts);
    const idTotals = new Array<number>(HARDCODED_POTION_TUNING.length).fill(0);

    this.uiRoot.async.setTimeout(() => {
      this.uiRoot.async.clearInterval(pulseAnimation);
      this.bundleRotation.stopAnimation();
      this.bundleIsVisible.set(false, target);
      this.newPotionsTextVisible.set(true, target);
      this.playPotionGacha(allPotions,idTotals);
    }, BUNDLE_OPEN_TIME);

    this.isVisible.set(true, target);
    this.uiRoot.sendLocalBroadcastEvent(Events.setPlayerBlocking, { isBlocking: true });
    this.uiRoot.sendLocalBroadcastEvent(Events.localHideHUD, { context });
    this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.addDisableContext, { context }, target);
  }

  playPotionGacha(potions: number[], idTotals: number[]) {
    let target = [this.localPlayer];

    let bundle = potions.splice(0, POTION_BUNDLE_SIZE);
    for (let i = 0; i < this.potionViewModels.length; i++) {
      this.potionViewModels[i].isVisible.set(false, target);
      this.potionTotalModels[i].isVisible.set(true, target);
    }

    for (let i = 0; i < this.potionViewModels.length; i++) {
      const viewModel = this.potionViewModels[i];

      const potionIndex = bundle[i]
      const potionId = HARDCODED_POTION_TUNING[potionIndex].potionId;

      const potionTuning = PotionData.getPotionTuning(potionId)!;
      const potionImage = PotionData.getPotionImage(potionId);

      viewModel.image.set(potionImage ?? missing_texture.getImage(), target);

      let rarity = Number(potionTuning.buffId);
      const totalModel = this.potionTotalModels[potionIndex];

      if (rarity !== undefined) {
        viewModel.text.set(`${potionTuning.shortName}`, target)
        viewModel.borderColor.set(ItemUtils.RARITY_HEX_COLORS[rarity], target)
      }
      else {
        log.error("Got invalid buffId from potion tuning");
      }

      viewModel.isVisible.set(false, target);

      this.uiRoot.async.setTimeout(() => {
        viewModel.isVisible.set(true, target);
        let total = idTotals[potionIndex] + 1;
        idTotals[potionIndex] = total;
        totalModel.text.set(`x${total}`, target);
        totalModel.popAnimation.set(UI_Utils.buttonAnimation(2, 100), undefined, target);
      }, DISPLAY_BUFFER_TIME * i + NEWPOTIONTEXT_TO_POTION_DELAY);
    }

    this.continueVisible.set(false, target);
    this.uiRoot.async.setTimeout(() => {
      if (potions.length > 0){
        this.playPotionGacha(potions, idTotals);
      }
      else{
        this.continueVisible.set(true, target);
      }
    }, DISPLAY_BUFFER_TIME * bundle.length + NEWPOTIONTEXT_TO_POTION_DELAY);
  }

  getRandomizedPotionIds(potionCounts: number[]){
    const potionIds: number[] = [];

    // Collect potion ids based on their counts
    potionCounts.forEach((count, id) => {
      for (let i = 0; i < count; i++) {
        potionIds.push(id);
      }
    });

    // Randomize the order of potion ids
    for (let i = potionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [potionIds[i], potionIds[j]] = [potionIds[j], potionIds[i]];
    }

    return potionIds;
  }

  onContinuePressed() {
    const target = [this.localPlayer];
    this.potionViewModels.forEach((x) => x.isVisible.set(false, target));
    this.isVisible.set(false, target);
    this.uiRoot.sendLocalBroadcastEvent(Events.localShowHUD, { context });
    this.uiRoot.sendLocalBroadcastEvent(Events.setPlayerBlocking, { isBlocking: false });
    this.uiRoot.sendNetworkBroadcastEvent(PlayerInteractionTrigger.removeDisableContext, { context }, target);
    this.uiRoot.sendLocalBroadcastEvent(Events.showHasNewPotions, {count: this.potionCount });
  }

  createNewPotionsText() {
    const newPotionsText = View({
      children: [
        UI_Utils.outlineText("NEW POTIONS!", this.featuredTextSize * this.outlineSizeMult, {
          fontFamily: "Roboto",
          color: "white",
          fontWeight: "900", // Maximum bold
          fontSize: this.featuredTextSize,
          alignSelf: "flex-start",
        }),
      ],
      style: {
        top: "7.6%",
        position: "absolute",
      },
    });

    return UINode.if(this.newPotionsTextVisible, newPotionsText);
  }

  createFullPotionsView() {
    return View({
      children: [
        this.createPotionRowView(POTION_BUNDLE_SIZE, 0),
      ],
      style: {
        flexDirection: 'column',
        alignContent: 'center',
        alignSelf: "center",
        alignItems: 'center',
        justifyContent: "center",
        position: "absolute",
        bottom: "50%",
      }
    })
  }

  createPotionRowView(count: number, startViewModelIndex: number) {
    const children = new Array<UIChildren>();
    for (let i = 0; i < count; i++) {
      children.push(this.createPotionView(this.potionViewModels[startViewModelIndex + i]));
    }

    return View({
      children,
      style: {
        flexDirection: 'row',
        alignContent: 'center',
        alignSelf: "center",
        alignItems: 'center',
        justifyContent: "center",
      }
    })
  }

  createPotionTotalRowView() {
    const children = new Array<UIChildren>();
    for (let i = 0; i < POTION_BUNDLE_SIZE; i++) {
      children.push(this.createPotionTotalView(this.potionTotalModels[i]));
    }

    return View({
      children,
      style: {
        flexDirection: 'row',
        alignContent: 'center',
        alignSelf: "center",
        alignItems: 'center',
        justifyContent: "center",
        position: "absolute",
        bottom: "30%",
      }
    })
  }

  createPotionView(potionViewModel: PotionViewModel) {
    const textBubble = View({
      children: [
        Text({
          text: potionViewModel.text,
          style: {
            fontSize: 15,
            fontFamily: 'Roboto',
            color: '#FFF',
            textAlign: 'center',
            fontWeight: '900',
            alignSelf: 'center',
          }
        }),
      ],
      style: {
        backgroundColor: potionViewModel.borderColor,
        borderRadius: 14,
        alignSelf: 'center',
        top: 16,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 10,
      },
    });

    const potionView = View({
      children: [
        Image({
          source: potionViewModel.image,
          style: {
            width: 80,
            height: 80,
            flexShrink: 0,
            resizeMode: "cover",
            left: "50%",
            top: "50%",
            transform: [{ translateX: -40 }, { translateY: -40 }],
          }
        }),
        textBubble,
      ],
      style: {
        width: 120,
        height: 120,
        borderRadius: 5,
        backgroundColor: '#FFCB5C',
        alignContent: "center",
        borderColor: potionViewModel.borderColor,
        borderWidth: 4,
        marginHorizontal: 10,
      }
    });

    return UINode.if(potionViewModel.isVisible, potionView);
  }

  createPotionTotalView(potionTotalViewModel: PotionTotalViewModel) {
    const potionTotalView = View({
      children: [
        Image({
          source: potionTotalViewModel.image,
          style: {
            width: 60,
            height: 60,
            flexShrink: 0,
            resizeMode: "cover",
            transform: [{ translateY: potionTotalViewModel.popAnimation.interpolate([1, 2], [0, -20]) },]
          }
        }),
        Text({
          text: potionTotalViewModel.text,
          style: {
            fontSize: 24,
            fontFamily: 'Roboto',
            color: '#FFF',
            backgroundColor: potionTotalViewModel.textBgColor,
            borderRadius: 15,
            textAlign: 'center',
            fontWeight: '900',
            alignSelf: 'center',
            height: 35,
            width: 50,
          }
        }),
      ],
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 10,
        padding: 10,
      }
    });

    return UINode.if(potionTotalViewModel.isVisible, potionTotalView);
  }

  createContinueButtonView() {
    const continueButton = Pressable({
      children: [
        Text({
          text: 'Continue',
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flexShrink: 0,
            alignSelf: "stretch",
            textAlign: "center",
            textAlignVertical: "center",
            color: "#FFF",
            fontSize: 30,
            fontFamily: "Roboto",
            fontWeight: "700"
          },
        }),
      ],
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
        flexDirection: "row",
        alignSelf: "center",
        position: "absolute",
        bottom: "16%"
      },
      onClick: () => this.onContinuePressed(),
    })

    return UINode.if(this.continueVisible, continueButton);
  }

  createPotionBundleView() {
    const bundleView = View({
      children: [
        Image({
          source: ImageSource.fromTextureAsset(this.props.icn_potionBundle!),
          style: {
            width: 135,
            height: 135,
            flexShrink: 0,
            resizeMode: "cover",
            transform: [{ rotate: this.bundleRotation.interpolate([-360, 360], ["-360deg", "360deg"]) },]
          }
        }),
      ],
      style: {
        position: 'absolute',
        top: "40%",
        left: "45%",
      }
    });

    return UINode.if(this.bundleIsVisible, bundleView);
  }

  createView() {
    const root = View({
      children: [
        this.createNewPotionsText(),
        this.createPotionBundleView(),
        this.createFullPotionsView(),
        this.createPotionTotalRowView(),
        this.createContinueButtonView(),
      ],
      style: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        alignContent: 'center',
        alignSelf: "center",
        alignItems: 'center',
        justifyContent: "center",
      }
    });

    return UINode.if(this.isVisible, root);
  }
}

class PotionViewModel {
  image: Binding<ImageSource>;
  text: Binding<string> = new Binding<string>("Uncommon");
  borderColor: Binding<ColorValue> = new Binding<ColorValue>("#FFF");
  isVisible: Binding<boolean> = new Binding<boolean>(false);

  constructor(imageSource: ImageSource) {
    this.image = new Binding(imageSource);
  }
}

class PotionTotalViewModel {
  image: Binding<ImageSource>;
  text: Binding<string> = new Binding<string>("x1");
  textBgColor: Binding<ColorValue> = new Binding<ColorValue>("#FFF");
  isVisible: Binding<boolean> = new Binding<boolean>(false);
  popAnimation: AnimatedBinding = new AnimatedBinding(0);

  constructor(imageSource: ImageSource) {
    this.image = new Binding(imageSource);
  }
}
