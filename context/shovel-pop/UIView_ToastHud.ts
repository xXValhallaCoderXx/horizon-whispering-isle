/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { BigBox_ToastEvents } from "BigBox_ToastManager";
import { Events } from "Events";
import { Component, Player } from "horizon/core";
import { AnimatedBinding, Animation, Bindable, Binding, ColorValue, Easing, Text, TextStyle, UINode, View, ViewProps, ViewStyle } from "horizon/ui";
import { Logger } from "Logger";
import { UIRoot_ChildrenBase } from "UIRoot_ChildrenBase";

const log = new Logger("UIView_ToastHud");

export class BigBox_Toast_UI_Utils {
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
}

//#region BigBox_Toast_Queue
/**
 * Super simple queue for storing toast order, not efficient.
 */
class BigBox_Toast_Queue<T> {
  private storage: T[] = [];

  constructor(private capacity: number = Infinity) { }

  /**
   * Adds a new item to the end of the queue.
   * @param item The value to be added to the queue.
   */
  enqueue(item: T): void {
    if (this.size() === this.capacity) {
      throw Error("Queue has reached max capacity, you cannot add more items");
    }
    this.storage.push(item);
  }

  /**
   * Removes and returns the item at the front of the queue.
   * @returns The item that was removed from the front of the queue.
   */
  dequeue(): T | undefined {
    return this.storage.shift();
  }

  /**
   * Returns the number of items currently in the queue.
   * @returns The number of items in the queue.
   */
  size(): number {
    return this.storage.length;
  }

  /**
   * Checks if the queue is empty.
   * @returns `true` if the queue is empty, `false` otherwise.
   */
  isEmpty(): boolean {
    return this.storage.length === 0;
  }
}
//#endregion BigBox_Toast_Queue

export class ToastData {
  text!: string;
  color!: ColorValue;

  constructor(text: string, color: ColorValue) {
    this.text = text;
    this.color = color;
  }
}

export class UIView_ToastHud extends UIRoot_ChildrenBase {
  // Config
  private readonly defaultTextSize = 24;
  private readonly outlineSizeMult = 0.075; // How large the text outline should be as a fraction of the font size
  private readonly outlineSize = this.defaultTextSize * this.outlineSizeMult;
  private readonly toastHeight = 32;
  private readonly moveTime = 300;
  private readonly fadeOutTime = 300;
  private readonly showTime = 2500; // How long the toast is shown
  private readonly maxToasts = 5;

  // Debugging
  private readonly runTestToast: boolean = false; // If true, will output test toasts on start

  // Define bindings for the custom UI
  private toastPanelHeightOffset!: AnimatedBinding;

  private toastTextBindingArray!: Binding<string>[];
  private toastOpacityBindingArray!: AnimatedBinding[];
  private toastColorBindingArray!: Binding<ColorValue>[];
  private toastTextArray: string[] = new Array(this.maxToasts).fill("");
  private toastColorArray: ColorValue[] = new Array(this.maxToasts).fill("white");

  private toastPopping: boolean = false;
  private toastQueue = new BigBox_Toast_Queue<ToastData>();
  private toastCleanupQueue = new BigBox_Toast_Queue<ToastData>();
  private toastFadingOutQueue = new BigBox_Toast_Queue<ToastData>();
  private toastsActive: number = 0;

  private shouldDelay: boolean = false;

  constructor(uiRoot: Component) {
    super(uiRoot);

    log.info(`Connected ToastHud to local player (${this.localPlayer.id})`);
    this.uiRoot.connectNetworkBroadcastEvent(BigBox_ToastEvents.textToast, data => { this.onLocalTextToast(data) });
    this.uiRoot.connectNetworkBroadcastEvent(BigBox_ToastEvents.textToastWithColor, data => { this.OnLocalTextToastWithColor(data) });

    this.uiRoot.connectLocalBroadcastEvent(Events.digResultHUDOpen, () => {
      this.shouldDelay = true;

      let toastCleanupQueueSize = this.toastCleanupQueue.size();
      for (let i = 0; i < toastCleanupQueueSize; i++) {
        this.cleanupOldestToast();
      }
    });

    this.uiRoot.connectLocalBroadcastEvent(Events.digResultHUDClose, () => {
      this.shouldDelay = false;

      // Try to pop any new toasts that have shown up
      this.popNextToast();
    })

    // Debugging feature for sending fake test toast events
    if (this.runTestToast) {
      this.testToast();
    }
  }

  private onLocalTextToast(payload: { player: Player, text: string }) {
    // Only listen to client side broadcasts that reference our player
    let owner = this.uiRoot.world.getLocalPlayer();
    let localPlayer = owner === null || owner === this.serverPlayer ? null : owner;

    if (localPlayer && localPlayer == payload.player) {
      // Recieved toast event, add it to the queue
      log.info(`BigBox_UI_ToastHud: Toasty text ${payload.text}`);

      let toastData = new ToastData(payload.text, "white");

      this.toastQueue.enqueue(toastData);
      this.popNextToast();
    }
  }

  private OnLocalTextToastWithColor(payload: { text: string, color: ColorValue }) {
    // Only listen to client side broadcasts that reference our player
    log.info(`BigBox_UI_ToastHud: Toasty text ${payload.text} and color ${payload.color}`);

      let toastData = new ToastData(payload.text, payload.color);

      this.toastQueue.enqueue(toastData);
      this.popNextToast();
  }

  private popNextToast() {
    if (this.toastQueue.isEmpty() || this.toastsActive >= this.maxToasts) {
      return;
    }

    if (this.toastPopping || this.toastFadingOutQueue.size() > 0) {
      return;
    }

    if (this.shouldDelay) {
      return;
    }

    this.toastPopping = true;
    this.toastsActive++;
    let currentToast = this.toastQueue.dequeue()!;
    this.toastCleanupQueue.enqueue(currentToast);

    let owner = this.uiRoot.world.getLocalPlayer();

    // Shift all existing text to the next slot
    for (let i = this.toastTextArray.length - 1; i > 0; --i) {
      this.toastTextArray[i] = this.toastTextArray[i - 1];
      this.toastTextBindingArray[i].set(this.toastTextArray[i], [owner]);

      this.toastColorArray[i] = this.toastColorArray[i - 1];
      this.toastColorBindingArray[i].set(this.toastColorArray[i], [owner]);

      if (this.toastTextArray[i].length > 0) {
        // Make sure it's visible if it has text
        this.toastOpacityBindingArray[i].set(1, () => { }, [owner]);
      }
    }

    // Set the new text
    this.toastTextArray[0] = currentToast.text;
    this.toastTextBindingArray[0].set(this.toastTextArray[0], [owner]);

    // Set the new color
    this.toastColorArray[0] = currentToast.color;
    this.toastColorBindingArray[0].set(this.toastColorArray[0], [owner]);

    // Fade in the new toast
    this.toastOpacityBindingArray[0].set(0, () => { }, [owner]);
    this.toastOpacityBindingArray[0].set(
      Animation.timing(
        1,
        { duration: this.moveTime, easing: Easing.in(Easing.quad) }
      ),
      undefined,
      [owner]
    );

    // Force the height down
    this.toastPanelHeightOffset.set(-this.toastHeight, undefined, [owner]);

    // Rise up the toast to pop it from the toaster
    this.toastPanelHeightOffset.set(
      Animation.timing(
        0,
        { duration: this.moveTime, easing: Easing.in(Easing.quad) }
      ),
      (finished: boolean, player: Player) => {
        if (finished) {
          // Done popping up, allow new toasts to pop
          log.info(`BigBox_UI_ToastHud: Done popping toast ${currentToast.text}`);

          this.toastPopping = false;

          // Try to pop any new toasts that have shown up
          this.popNextToast();

          // Clean up this toast after show time
          this.uiRoot.async.setTimeout(() => {
            this.cleanupOldestToast();
          }, this.showTime);
        }
      },
      [owner]
    );
  }

  private cleanupOldestToast() {
    // Block other toasts from popping while this fades out to avoid interruption
    this.toastFadingOutQueue.enqueue(this.toastCleanupQueue.dequeue()!);
    let currentIndex = this.toastCleanupQueue.size();

    // Fade it out
    this.toastOpacityBindingArray[currentIndex].set(
      Animation.timing(
        0,
        { duration: this.fadeOutTime, easing: Easing.in(Easing.quad) }
      ),
      (finished: boolean, player: Player) => {
        if (finished) {
          this.toastsActive--;
          this.toastFadingOutQueue.dequeue();

          // Clear out the text
          this.toastTextArray[currentIndex] = "";
          this.toastTextBindingArray[currentIndex].set(this.toastTextArray[currentIndex], [this.localPlayer]);

          // Clear out the color
          this.toastColorArray[currentIndex] = "white";
          this.toastColorBindingArray[currentIndex].set(this.toastColorArray[currentIndex], [this.localPlayer]);

          // Try to pop any new toasts that have shown up
          this.popNextToast();
        }
      },
      [this.localPlayer]
    );
  }

  // Creates the toast UI element which will be a constant height
  private CreateToastView(text: Bindable<string>, opacity: AnimatedBinding, color: Binding<ColorValue>): UINode<ViewProps> {
    const textStyle: TextStyle = {
      fontFamily: "Roboto",
      color: color,
      opacity: opacity,
      fontWeight: "700",
      fontSize: this.defaultTextSize,
      alignItems: "center",
      textAlign: "center",
    }

    return View({
      children: [
        BigBox_Toast_UI_Utils.outlineText(text, this.outlineSize, textStyle),
      ],
      style: {
        height: this.toastHeight,
      }
    });
  }

  // Returns an array of UI toasts
  private createToastViewArray(): UINode[] {
    let array: UINode[] = new Array();

    for (let i = 0; i < this.maxToasts; ++i) {
      array.push(this.CreateToastView(this.toastTextBindingArray[i], this.toastOpacityBindingArray[i], this.toastColorBindingArray[i]))
    }

    return array;
  }

  createView() {
    this.toastPanelHeightOffset = new AnimatedBinding(0);
    this.toastTextBindingArray = Array.from({ length: this.maxToasts }, () => new Binding(""));
    this.toastOpacityBindingArray = Array.from({ length: this.maxToasts }, () => new AnimatedBinding(0));
    this.toastColorBindingArray = Array.from({ length: this.maxToasts }, () => new Binding<ColorValue>("white"));

    // Panel that contains all toast elements
    const toastPanelView = View({
      children: this.createToastViewArray(),
      style: {
        flexDirection: "column-reverse", // Ensure children are laid out top to bottom, with the 1st at the bottom
        alignItems: "center", // Center align vertically
        bottom: this.toastPanelHeightOffset, // Offset from the bottom of the parent view
      },
    });

    const rootPanelStyle: ViewStyle = {
      width: "50%",
      height: "70%",
      position: "absolute",
      justifyContent: "flex-end", // Align vertical to the bottom
      alignContent: "center",
      alignSelf: "center",
      alignItems: "center", // Align horizontal to the middle
    }

    return View({//Root Panel + Panel Background Image
      children: [
        toastPanelView,
      ],
      style: rootPanelStyle,
    });
  }

  //#region testToast
  private testToast(): void {
    let owner = this.uiRoot.world.getLocalPlayer();
    this.uiRoot.async.setTimeout(() => {
      this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
        player: owner,
        text: "You're not standing on diggable terrain."
      }, [owner]);

      // SPAMMMMMMMMMMMMMMMMMMMMMMMM
      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You've dug here recently.0"
        }, [owner]);
      }, 50);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You failed to dig up this pile.1"
        }, [owner]);
      }, 150);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You've dug here recently.2"
        }, [owner]);
      }, 250);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You failed to dig up this pile.3"
        }, [owner]);
      }, 1500);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You've dug here recently.4"
        }, [owner]);
      }, 1500);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You failed to dig up this pile.5"
        }, [owner]);
      }, 2500);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You've dug here recently.6"
        }, [owner]);
      }, 4500);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You failed to dig up this pile.7"
        }, [owner]);
      }, 10000);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You've dug here recently.8"
        }, [owner]);
      }, 12500);

      this.uiRoot.async.setTimeout(() => {
        this.uiRoot.sendNetworkBroadcastEvent(BigBox_ToastEvents.textToast, {
          player: owner,
          text: "You failed to dig up this pile.9"
        }, [owner]);
      }, 12700);

    }, 1000);
  }
  //#endregion testToast
}
