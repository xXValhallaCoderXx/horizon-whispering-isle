/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Asset, Color, Player } from 'horizon/core';
import { AnimatedBinding, Animation, Bindable, Binding, Easing, Image, ImageSource, ImageStyle, Text, TextStyle, UINode, View, ViewStyle } from 'horizon/ui';

type OutlineProps = { text: Bindable<string>, outlineSize: number, style: TextStyle }

export class UI_Utils {
  // Create text with an outline - The nastiest h4XX0r the world has ever known
  static outlineText(text: Bindable<string>, outlineSize: number, textStyle: TextStyle) {
    return View({
      children: [
        Text({ text, style: { textShadowOffset: [-outlineSize, -outlineSize], ...textStyle } }),
        // Absolute position so this will stack directly over the main text object
        Text({ text, style: { textShadowOffset: [outlineSize, -outlineSize], position: "absolute", ...textStyle } }),
        Text({ text, style: { textShadowOffset: [-outlineSize, outlineSize], position: "absolute", ...textStyle } }),
        Text({ text, style: { textShadowOffset: [outlineSize, outlineSize], position: "absolute", ...textStyle } }),
      ],
      style: {
        flexDirection: "row",
        justifyContent: "center",
      },
    });
  }

  // New outline text version that converts easily from existing Text views.
  static outlinedText(props: OutlineProps) {
    return View({
      children: [
        Text({ text: props.text, style: { textShadowOffset: [-props.outlineSize, -props.outlineSize], ...props.style } }),
        Text({ text: props.text, style: { textShadowOffset: [props.outlineSize, -props.outlineSize], position: "absolute", ...props.style } }),
        Text({ text: props.text, style: { textShadowOffset: [-props.outlineSize, props.outlineSize], position: "absolute", ...props.style } }),
        Text({ text: props.text, style: { textShadowOffset: [props.outlineSize, props.outlineSize], position: "absolute", ...props.style } }),
      ],
      style: {
        flexDirection: "row",
        justifyContent: "center",
      },
    });
  }

  static buttonAnimation(scale: number = 0.85, duration = 40) {
    const easing = Easing.bounce;
    return Animation.sequence(
      Animation.timing(scale, { duration, easing: Easing.in(easing) }),
      Animation.timing(1, { duration, easing: Easing.out(easing) })
    )
  }

  static simplifyNumberToText(value: number, floored: boolean = false): string {
    if (value < 0) {
      return '-' + this.simplifyNumberToText(-value, floored);
    }

    const units = [
      { threshold: 1_000_000_000, suffix: 'B', divisor: 1_000_000_000 },
      { threshold: 1_000_000, suffix: 'M', divisor: 1_000_000 },
      { threshold: 10_000, suffix: 'K', divisor: 1_000 },
    ];

    for (const { threshold, suffix, divisor } of units) {
      if (value >= threshold) {
        const scaled = value / divisor;
        const result = floored
          ? Math.floor(scaled * 10) / 10 // Floor for things like money where we don't want to inflate the value
          : parseFloat(scaled.toFixed(1));
        return result.toString() + suffix;
      }
    }

    return value.toString();
  }

  static makeNewBadge(text: Binding<string>, top: number, right: number, style?: ViewStyle) {
    return View({
      children: [
        UI_Utils.outlinedText({
          text: text,
          outlineSize: 1,
          style: {
            top: 1,
            alignSelf: "center",
            fontSize: 17,
            textAlign: "center",
            textAlignVertical: "center",
            fontFamily: "Roboto",
            fontWeight: "bold",
          }
        })
      ],
      style: {
        backgroundColor: "red",
        borderRadius: 12,
        borderColor: "red",
        width: 24,
        height: 24,
        position: "absolute",
        top,
        right,
        ...style
      }
    })
  }
}

//** CORE */
export const STYLE_FULL_FILL: ViewStyle = {
  width: '100%',
  height: '100%',
}

//** IMAGE */
export const IMAGE_STYLE_DEFAULT: ImageStyle = {
  ...STYLE_FULL_FILL,
  tintOperation: 'multiply',
}

//** CORE */
export interface UIWrapper {
  render: () => UINode;
}

export function render(ui: UIWrapper[]) {
  const nodes: UINode[] = [];
  ui.forEach((value) => {
    nodes.push(value.render());
  })

  return nodes;
}

export abstract class UIBaseComponent implements UIWrapper {
  protected isVisible: boolean = true;
  protected visibilityBinding: Binding<boolean> = new Binding<boolean>(true);

  protected isDynamic = false;

  protected activePlayer: Player | undefined

  constructor(isDynamic: boolean = false) {
    this.isDynamic = isDynamic;
  }

  setVisible(visible: boolean) {
    if (this.isVisible == visible) {
      return;
    }
    this.isVisible = visible;
    this.visibilityBinding.set(this.isVisible, [this.activePlayer!]);
  }

  getVisible() {
    return this.isVisible;
  }

  setActiveUser(player: Player | undefined) {
    this.activePlayer = player
  }

  getActiveUser() {
    return this.activePlayer
  }

  abstract renderComponent(): UINode;

  render(): UINode {
    if (!this.isDynamic) {
      return this.renderComponent();
    }
    return UINode.if(
      this.visibilityBinding,
      this.renderComponent(),
    );
  }
}

//** IMAGE */
export class UIImage extends UIBaseComponent {
  protected tintColor: Color = Color.white;
  protected tintBinding: Binding<string> = new Binding<string>('white');

  protected imageSource: ImageSource;
  protected imageSourceBinding: Binding<ImageSource>;

  imageStyle: ImageStyle;

  constructor(imageSource: ImageSource, style: ImageStyle = IMAGE_STYLE_DEFAULT, isDynamic: boolean = false) {
    super(isDynamic);

    this.imageSource = imageSource;
    this.imageSourceBinding = new Binding<ImageSource>(this.imageSource);
    this.imageStyle = {
      ...style,
      tintColor: this.tintBinding,
    };
  }

  setImage(imageSource: ImageSource, players?: Player[]) {
    this.imageSource = imageSource;
    this.imageSourceBinding.set(this.imageSource, players);
  }

  getImage() {
    return this.imageSource;
  }

  setTint(color: Color) {
    this.tintColor = color;
    this.tintBinding.set(this.tintColor.toHex());
  }

  getTint() {
    return this.tintColor;
  }

  override renderComponent() {
    if (!this.isDynamic) {
      return Image({
        source: this.imageSource,
        style: this.imageStyle,
      });
    }
    return Image({
      source: this.imageSourceBinding,
      style: this.imageStyle,
    });
  }
}

export class LazyImageSource {
  private imageSource: ImageSource | undefined;
  constructor(private assetId: bigint, private version?: bigint) { }
  getImage() { return this.imageSource ??= ImageSource.fromTextureAsset(new Asset(this.assetId, this.version)); }
}

export const missing_texture = new LazyImageSource(BigInt(3990878524518014));

export class UITransform {
  public translateX = new AnimatedBinding(0);
  public translateY = new AnimatedBinding(0);
  public scale = new AnimatedBinding(1);
  public opacity = new AnimatedBinding(0);
  reset(initialState: { translateX?: number, translateY?: number, scale?: number, opacity?: number }) {
    this.translateX.set(initialState.translateX ?? 0);
    this.translateY.set(initialState.translateY ?? 0);
    this.scale.set(initialState.scale ?? 1);
    this.opacity.set(initialState.opacity ?? 0);
  }
}
