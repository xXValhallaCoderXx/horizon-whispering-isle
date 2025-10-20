declare module 'horizon/ui' {
/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 *
 * @format
 */
import { Entity, Player, Color, Component, ComponentWithConstructor, SerializableState, TextureAsset } from 'horizon/core';
import { LocalizableText } from 'HorizonI18nUtils';
import type { ComponentMap } from 'HorizonUIUtils';
declare type UIComponentProps = ComponentMap[keyof ComponentMap];
/**
 * Represents a UI element in a custom UI panel. You cannot directly instantiate a
 * new `UINode`; this type is return by UI component methods and UI functions.
 *
 * @remarks
 * The following functions return `UINode` objects:
 *
 * {@link DynamicList}
 *
 * {@link Image_2}
 *
 * {@link Pressable}
 *
 * {@link ScrollView}
 *
 * {@link Text_2}
 *
 * {@link View}
 */
export declare class UINode<T extends UIComponentProps = UIComponentProps> {
    /**
     * Conditionally renders the UI element based on the a condition.
     *
     * @param condition - The condition to check. Accepts a boolean or a binding of a boolean.
     * @param trueComponent - The UI element to render when the condition is true. If not
     * provided, nothing is rendered when the condition is true.
     * @param falseComponent - The UI element to render when the condition is false. If not
     * provided, nothing is rendered when the condition is false.
     * @returns A UINode that represents the result of the conditional rendering. Although
     * the return type is a UINode, it is not really a node in the DOM tree. The components
     * in the argument, if rendered, will appear in the DOM tree.
     */
    static if(condition: Bindable<boolean>, trueComponent?: UIChildren, falseComponent?: UIChildren): UINode<ConditionalProps>;
}
/**
 * The base class for value-based bindings, including {@link Binding} and DerivedBinding. These bindings
 * are represented as string keys in the data model, and their values are updated in the redux
 * store. These bindings support both global values and player-specific values.
 */
export declare abstract class ValueBindingBase<T> {
    private _key;
    protected _isInitialized: boolean;
}
/**
 * Represents a container for a variable value used by UI components. It can
 * be passed to the supported props and styles of a component in place of an explicit value.
 * When the value of the Binding is updated at runtime, the UI panels that use it are
 * automatically re-rendered to reflect the change.
 *
 * @remarks
 * There are other types of bindings, but this is the most basic type, where the Binding
 * value is directly controlled in TypeScript.
 *
 * Bindings can affect global or player values, so it's important to notice when a member
 * description is specific to a global value or a player value. A global value is a value
 * applied to every player by default before any player specific value is applied. A
 * player value is a value that overrides a global value for a specific player.
 *
 * For details about usage, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/building-dynamic-custom-ui | Building Dynamic Custom UIs}.
 *
 * @example
 * ```
 * const binding = new Binding(initialValue);
 * binding.set(newValue);
 * ```
 */
export declare class Binding<T> extends ValueBindingBase<T> {
    private _dependents;
    private _globalValue;
    private _playerValues;
    /**
     * Creates a Binding.
     * @param value - The initial value of the Binding.
     */
    constructor(value: T);
    /**
     * Updates the value of the Binding and queues a re-render operation for all UI
     * panels that use the Binding. The UI does not update if the new and old values
     * are the same.
     *
     * @param value - The new value of the Binding, or an updater function that
     * receives the previous value and mutates both the global value and each associated
     * `player` value.
     * @param players - An optional array of players to send the value update to. It is used to
     * determine whether the global value or the player-specific value should be updated. When
     * not provided, all players receive the updated value; the global value is updated, and any
     * player-specific values are cleared. When provided, only those players will get the new
     * value as a new player-specific value, but the global value is unchanged.
     */
    set(value: T | ((prev: T) => T), players?: Array<Player>): void;
    /**
     * Resets the player-specific value of the binding, if any, back to the global value. Like
     * the {@link Binding.set} method, this method also queues a re-render operation for all UI panels
     * that use this Binding.
     *
     * @param players - The players to reset the value for. If not provided, all player-spesific
     * values are cleared. If provided, only value for players in the list are
     * reset and receive the global value.
     */
    reset(players?: Array<Player>): void;
    /**
     * Derives a new value for the Binding using the provided map function.
     *
     * @remarks
     * The derived value maintains any existing player value of the Binding. The map function
     * derives the global value and each player value.
     *
     * @param mapFn - A function that specifies how the derived value is calculated from the Binding.
     * It takes the value of the Binding as parameter, and returns the derived value.
     * @returns A derived Binding. Just like a Binding, it can be passed to the supported props and
     * styles of a component in place of an explicit value. However, it does not have a set method;
     * its value is purely derived from the Binding that it depends on.
     */
    derive<R>(mapFn: (value: T) => R): DerivedBinding<R, [T]>;
    /**
     * Derives a new value from a list of Bindings with the provided map function.
     * @param dependencies - The list of Bindings to depend on.
     * @param mapFn - A function that specifies how the derived value is calculated from the Bindings
     * that it depends on. It takes the values of the dependencies as parameters, and returns the
     * derived value.
     * @returns A derived Binding. Just like a Binding, it can be passed to the supported props and
     * styles of a component in place of an explicit value. However, it does not have a set() method;
     * its value is purely derived from the Bindings that it depends on.
     */
    static derive<R, A extends unknown[]>(dependencies: [...Dependencies<A>], mapFn: (...args: A) => R): DerivedBinding<R, A>;
}
declare type Dependencies<A extends unknown[]> = {
    [I in keyof A]: Binding<A[I]>;
};
/**
 * Derived Binding does not have its own value. Instead, it computes its value from other Bindings.
 * When the value of one of the dependencies changes, the Derived Binding's value is automatically
 * updated, which will also enqueue a re-render for all the UI panels that use this Derived Binding.
 * We do not reveal the concept of Derived Binding to users. Instead, the functionality is provided
 * through the `someBinding.derive()` method and `Binding.derive()` static mathod.
 */
declare class DerivedBinding<T, A extends unknown[]> extends ValueBindingBase<T> {
    private _dependencies;
    private _mapFn;
    constructor(dependencies: [...Dependencies<A>], mapFn: (...args: A) => T, forceInitialize?: boolean);
    initializeBindingToRedux(): void;
}
/**
 * A {@link Binding} that supports animations when setting values. Only numbers are
 * supported. When the value of the `AnimatedBinding` is updated at runtime, the UI
 * panels that use it are automatically re-rendered to reflect the change.
 *
 * @remarks
 * The `AnimatedBinding` class differs from the {@link Binding} class in the
 * following ways:
 *
 * 1. It only takes number value, while the `Binding` class takes any type.
 *
 * 2. It has no {@link Binding.derive | derive()} method, but has a more
 * restrictive {@link AnimatedBinding.interpolate} method.
 *
 * 3. In addition to plain numbers and update functions, the {@link AnimatedBinding.set}
 * method can also take an Animation object to define an animated transition to the new value.
 *
 * For information about usage, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/animations-for-custom-ui | Animations For Custom UIs}.
 *
 * @example
 * ```
 * const anim = new AnimatedBinding(initialValue);
 * anim.set(Animation.timing(newValue));
 * ```
 */
export declare class AnimatedBinding extends ValueBindingBase<number> {
    private _callbackListener;
    private _callbackMap;
    private _globalValue;
    private _playerValues;
    /**
     * Constructs a new instance of the `AnimatedBinding` class.
     *
     * @param value - The value of the binding.
     */
    constructor(value: number);
    /**
     * Updates the value of the binding and queues a re-render operation for all UI
     * panels that use the binding. The UI does not update if the new and old values
     * are the same.
     *
     * @remarks
     * To play multiple animations for the same `AnimatedBinding` object in a
     * sequence, the {@link Animation_2.sequence} method performs better than
     * starting the next animation in the `onEnd` callback.
     *
     * When the `value` parameter is a an explicit value or an updater function, the
     * value of the `AnimatedBinding` object is updated immediately without any
     * animated transition. The updater function recieves the current value and
     * mutates both the global value and each associated player value. If an
     * {@link Animation_2} object is passed to the `value` parameter, the `AnimatedBinding`
     * object will smoothly transition to the final value using the specified
     * animation.
     *
     * @param value - The new value of the binding. This parameter can either be
     * an explicit value, an updater function, or an {@link Animation_2} object.
     * @param onEnd - If an animation is passed to the `value` parameter, this
     * callback triggers when animation ends, whether the animation completes or
     * stops prematurely. This parameter is ignored if an {@link Animation_2}
     * object is not passed to the `value` parameter.
     * @param players - The players to apply the updated value to. This is used to
     * determine whether the global value or the player-specific value should be updated. When
     * not provided, all players receive the updated value; the global value is updated, and any
     * player-specific values are cleared. When provided, only those players will get the new
     * value as a new player-specific value, but the global value is unchanged.
     */
    set(value: number | ((prev: number) => number) | Animation, onEnd?: AnimationOnEndCallback, players?: Array<Player>): void;
    /**
     * Resets the player-specific value of the binding, if any, back to the global value. Like
     * the {@link Binding.set} method, this method also queues a re-render operation for all UI panels
     * that use this Binding.
     *
     * @param players - The players to reset the value for. If not provided, all player-specific
     * values are cleared. If provided, only value for players in the list are
     * reset and receive the global value.
     */
    reset(players?: Array<Player>): void;
    /**
     * Stops the binding animation for the given players.
     *
     * @param players - The players to stop the animation for.
     */
    stopAnimation(players?: Array<Player>): void;
    /**
     * Returns and interpolated version of the animated binding.
     *
     * @remarks
     * This method maps the value of the animated binding to a new range using linear
     * interpolation (LERP).
     *
     * When the length of the `inputRange` and `outputRange` is greater than 2, the animated
     * binding is interpolated with multiple range segments. Within each segment, the
     * value is interpolated linearly.
     *
     * When an input number is outside of the `inputRange`, it will linearly extrapolate
     * beyond the ranges given. To achieve a clamped extrapolation, you can add a small
     * flat segment outside of the range.
     *
     * @param inputRange - The range of number inputs to map to the output range of the
     * interpolation. The array must have at least 2 elements. Each value in the range
     * must be must be greater than or equal to the previous value
     * (monotonically non-decreasing). The range must not contain positive or negative
     * infinity.
     * @param outputRange - The range of number, string, or color outputs to map to
     * the input range of the interpolation. The array must be of the same length
     * as the `inputRange` array. The range must not contain positive or negative
     * infinity. When the array elements are strings or Color objects, all elements
     * must be of the same category. If the elements are suffixed numbers
     * (a number with a unit, like `5.5%`, `90deg`), there must be no space between
     * number and suffix, and all elements must have the same suffix. If the elements
     * are colors, different color formats can be used in the same array.
     */
    interpolate<T extends number | string | Color>(inputRange: Array<number>, outputRange: Array<T>): AnimatedInterpolation<T>;
    private handleEndCallback;
    private maybeConnectCallbackListeners;
    private maybeDisconnectCallbackListeners;
}
/**
 * A type of animated binding that is interpolated from another animated binding.
 *
 * @remarks For more information, see the developer guide about
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/animations-for-custom-ui#interpolation | interpolation}.
 */
export declare class AnimatedInterpolation<T extends number | string | Color> extends ValueBindingBase<T> {
    private _dependency;
    private inputRange;
    private outputRange;
    private _exampleValue;
}
/**
 * A simple or composite animation that can be passed to the
 * {@link AnimatedBinding.set} method.
 *
 * @remarks
 * Animations start on their own; they can only be used inside an
 * {@link AnimatedBinding.set} call.
 *
 * For information about usage, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/animations-for-custom-ui | Animations for Custom UIs}.
 *
 * @example
 * ```
 * const anim = new AnimatedBinding(initialValue);
 * anim.set(Animation.repeat(Animation.timing(endValue, {duration: 300})));
 * ```
 */
export declare abstract class Animation {
    /**
     * Applies a timing animation to the binding based on the given easing curve.
     *
     * @param value - The binding value. This can be an explicit value or an updater
     * function that calculates the new value from the previous value.
     * @param config - The animation configuration that specifies the easing
     * curve.
     */
    static timing(value: number | ((prev: number) => number), config?: TimingAnimationConfig): Animation;
    /**
     * Runs a set of animations in sequence.
     *
     * @remarks
     * When playing multiple animations in a squence for the same {@link AnimatedBinding} object,
     * the `sequence` method performs better than the `onEnd` callback that is passed to
     * the `AnimatedBinding`. However, to play animations for different
     * {@link AnimatedBinding} objects in sequence, you must use the `onEnd` callback.
     *
     * @param animations - The animations to run in sequence.
     */
    static sequence(...animations: Array<Animation>): Animation;
    /**
     * Repeats an animation the given number of times.
     *
     * @remarks
     * Before each iteration of the animation, the animated binding is reset to the default
     * value when was is created.
     *
     * @param animation - The animation to repeat.
     * @param iterations - The number of times to repeat the animation. If not provided,
     * or if a negative value if provided, the animation repeats until it is interrupted
     * or stopped. When repeating the animation by passing an updater function to the
     * {@link AnimatedBinding} object, the effect is not accumulative. The same animation
     * with the same start and end values is replayed.
     */
    static repeat(animation: Animation, iterations?: number): Animation;
    /**
     * Starts an animation after the specified duration.
     *
     * @param time - The length of the delay to apply to the animation, in milliseconds.
     * @param animation - The animation to apply the delay to.
     */
    static delay(time: number, animation: Animation): Animation;
}
/**
 * Defines how to {@link Animation_2 | animate} a value along an easing curve.
 *
 * @remarks
 * Type Parameters:
 *
 * duration - The duration of the animation.
 *
 * easing - The function that defines the easing curve.
 */
export declare type TimingAnimationConfig = {
    duration?: number;
    easing?: Easing;
};
/**
 * A set of easing functions for configuring {@link TimingAnimationConfig | timing animations}.
 * Easing functions provide physical motion animations.
 */
export declare class Easing {
    /**
     * A back easing.
     */
    static get back(): Easing;
    /**
     * Returns an easing that uses a cubic bezier curve.
     *
     * @param x1 - The x coordinate of the first control point of the curve.
     * @param y1 - The y coordinate of the first control point of the curve.
     * @param x2 - The x coordinate of the second control point of the curve.
     * @param y2 - The y coordinate of the second control point of the curve.
     *
     * @returns
     */
    static bezier(x1: number, y1: number, x2: number, y2: number): Easing;
    /**
     * An easing that provides a bouncing animation.
     */
    static get bounce(): Easing;
    /**
     * A circular easing.
     */
    static get circle(): Easing;
    /**
     * A cubic easing.
     */
    static get cubic(): Easing;
    /**
     * An easing that starts slow, accelerates quickly, and then gradually
     * slows down until stopping.
     */
    static get ease(): Easing;
    /**
     * Returns and elastic easing.
     *
     * @param easing - The easing to update.
     *
     * @returns The updated easing.
     */
    static elastic(bounciness: number): Easing;
    /**
     * An exponential easing.
     */
    static get exp(): Easing;
    /**
     * A linear easing.
     */
    static get linear(): Easing;
    /**
     * Returns a power easing.
     *
     * @param easing - The easing to update.
     *
     * @returns The updated easing.
     */
    static poly(n: number): Easing;
    /**
     * A quadratic easing.
     */
    static get quad(): Easing;
    /**
     * A sin easing.
     */
    static get sin(): Easing;
    /**
     * Returns an easing that runs forwards.
     *
     * @param easing - The easing to update.
     *
     * @returns The updated easing.
     */
    static in(easing: Easing): Easing;
    /**
     * Returns an easing that runs backwards.
     *
     * @param easing - The easing to update.
     *
     * @returns The updated easing.
     */
    static out(easing: Easing): Easing;
    /**
     * Returns an easing that runs forwards and then backwards.
     *
     * @param easing - The easing to update.
     *
     * @returns The updated easing.
     */
    static inOut(easing: Easing): Easing;
}
/**
 * Represents the Custom UI Gizmo used to create custom 2D UI panels containing
 * interactive {@link Text_2 | text}, {@link Image_2 | images}, and other elements.
 *
 * @remarks
 * For information about usage, see the
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/tutorials/tutorial-worlds/custom-ui-examples-tutorial/station-0-setup | Custom UI Examples} tutorial.
 */
export declare class UIGizmo extends Entity {
    /**
     * Creates a human-readable representation of the UI Gizmo.
     * @returns A string representation of the gizmo.
     */
    toString(): string;
}
/**
 * The base class for a UI panel, and the scripting component to attach
 * to a {@link UIGizmo | UI Gizmo}. It inherits the methods and properties from its
 * parent Component class, with some UI-specialized additions.
 *
 * @remarks
 * For information about usage, see the
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/tutorials/tutorial-worlds/custom-ui-examples-tutorial/station-0-setup | Custom UI Examples}
 * tutorial and {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/video-create-performant-custom-uis-in-horizon-worlds | Custom UI guides}.
 *
 * @example
 * ```
 * class Welcome extends UIComponent {
 *  initializeUI() {
 *    return Text({text: 'Welcome to my World'});
 *  }
 * }
 * ```
 */
export declare abstract class UIComponent<TComponent = ComponentWithConstructor<Record<string, unknown>>, TState extends SerializableState = SerializableState> extends Component<TComponent, TState> {
    private _bindingMap;
    /**
     * The width of the UI panel, in pixels. You can't change the value after the panel
     * is initialized.
     *
     * @remarks
     * Default value: 500.
     */
    protected readonly panelWidth: number;
    /**
     * The height of the panel, in pixels. You can't change the value after the panel
     * is initialized.
     *
     * @remarks
     * Default value: 500.
     */
    protected readonly panelHeight: number;
    /**
     * A default `start` implementation for classes that inherit from UIComponent.
     */
    start(): void;
    /**
     * Defines the UI and sets up necessary event subscriptions. This method is called
     * before the {@link UIComponent.start} method when the component is started.
     *
     * @remarks
     * This method must return a valid UINode.
     */
    abstract initializeUI(): UINode;
}
declare type AnyBinding<T> = ValueBindingBase<T>;
declare type DistributeBindingForUnion<T> = T extends any ? AnyBinding<T> : never;
/**
 * Represents a type that can bind to a UI element. Bound types are re-rendered
 * when the bound properties change.
 */
export declare type Bindable<T> = T | AnyBinding<T> | DistributeBindingForUnion<T>;
/**
 * Represents a callback function interface for a {@link core#Player} object.
 *
 * @remarks
 * Type Parameters:
 *
 * player - The player associated with the callback.
 */
export declare type Callback = (player: Player) => void;
/**
 * Represents a callback function interface for a {@link core#Player}
 * object and its associated data.
 *
 * @remarks
 * Type Parameters:
 *
 * player - The player associated with the callback.
 *
 * payload - The data associated with the player.
 */
export declare type CallbackWithPayload = (player: Player, payload: string) => void;
declare type AnimationOnEndCallback = (finished: boolean, player: Player) => void;
/**
 * Stores a set of bindings (both Binding and DerivedBinding) during data model serialization.
 */
export declare type BindingSet = Set<ValueBindingBase<unknown>>;
/**
 * Stores a map of IDs to callback functions for use during data model serialization.
 */
export declare type CallbackMap = Map<string, Callback | CallbackWithPayload>;
/**
 * The child nodes of a UI element.
 */
export declare type UIChildren = UINode | UINode[];
/**
 * The base type for dimensions.
 */
export declare type DimensionValue = number | string;
/**
 * The base type for colors.
 *
 * @remarks
 * When represented by a string, the following formats are allowed:
 *
 * RGB Hexadecimal - example: `#53575E`
 *
 * RGB (Red, Green, Blue) - example: `rgb(100, 50, 0)`
 *
 * RGBA (Red, Green, Blue, Alpha) - example: `rgba(255, 105, 180, 0)`
 *
 * HSL (Hue, Saturation, Lightness) - example: `hsl(0, 50%, 50%)`
 *
 * Named colors - example: `dodgerblue`
 */
export declare type ColorValue = string | Color;
/**
 * Represents the props of a UINode.if() node (for conditional rendering).
 */
export declare type ConditionalProps = {
    condition: Bindable<boolean>;
    true?: UIChildren;
    false?: UIChildren;
};
/**
 * Represents the styles of a layout for a UI panel. For descriptions of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#layoutstyle | Custom UI Styles}.
 *
 * @remarks
 * The {@link UIComponent} class is the base class for controlling custom UI panels in a world. See {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/creating-a-custom-ui-panel | Create a custom UI panel}
 * for guides about using the API.
 */
export declare type LayoutStyle = {
    /**
     * The display mode of the UI element.
     *
     * - `none` - The UI element is not rendered.
     *
     * - `flex` - The UI element is displayed as a block. This is the default value.
     */
    display?: Bindable<'none' | 'flex'>;
    /**
     * The width, in pixels as a number or percentages as a string, of the UI element.
     */
    width?: Bindable<DimensionValue>;
    /**
     * The height, in pixels as a number or percentages as a string, of the UI element.
     */
    height?: Bindable<DimensionValue>;
    /**
     * The bottom offset, in pixels as a number or percentages as a string, of the UI element.
     */
    bottom?: Bindable<DimensionValue>;
    /**
     * Equivalent to `right` when `direction` is `ltr`. Equivalent to `left` when `direction` is `rtl`.
     */
    end?: DimensionValue;
    /**
     * The left offset, in pixels as a number or percentages as a string, of the UI element.
     */
    left?: Bindable<DimensionValue>;
    /**
     * The right offset, in pixels as a number or percentages as a string, of the UI element.
     */
    right?: Bindable<DimensionValue>;
    /**
     * Equivalent to `left` when `direction` is `ltr`. Equivalent to `right` when `direction` is `rtl`.
     */
    start?: DimensionValue;
    /**
     * The top offset, in pixels as a number or percentages as a string, of the UI element.
     */
    top?: Bindable<DimensionValue>;
    /**
     * The minimum width, in pixels as a number or percentages as a string, of the UI element.
     */
    minWidth?: DimensionValue;
    /**
     * The maximum width, in pixels as a number or percentages as a string, of the UI element.
     */
    maxWidth?: DimensionValue;
    /**
     * The minimum height, in pixels as a number or percentages as a string, of the UI element.
     */
    minHeight?: DimensionValue;
    /**
     * The maximum height, in pixels as a number or percentages as a string, of the UI element.
     */
    maxHeight?: DimensionValue;
    /**
     * Setting `margin` has the same effect as setting each of `marginTop`, `marginLeft`, `marginBottom`, and `marginRight`.
     */
    margin?: DimensionValue;
    /**
     * The bottom margin, in pixels as a number or percentages as a string, of the UI element.
     */
    marginBottom?: DimensionValue;
    /**
     * Equivalent to `marginRight` when `direction` is `ltr`. Equivalent to `marginLeft` when `direction` is `rtl`.
     */
    marginEnd?: DimensionValue;
    /**
     * Setting `marginHorizontal` has the same effect as setting both `marginLeft` and `marginRight`.
     */
    marginHorizontal?: DimensionValue;
    /**
     * The left margin, in pixels as a number or percentages as a string, of the UI element.
     */
    marginLeft?: DimensionValue;
    /**
     * The right margin, in pixels as a number or percentages as a string, of the UI element.
     */
    marginRight?: DimensionValue;
    /**
     * Equivalent to `marginLeft` when `direction` is `ltr`. Equivalent to `marginRight` when `direction` is `rtl`.
     */
    marginStart?: DimensionValue;
    /**
     * The top margin, in pixels as a number or percentages as a string, of the UI element.
     */
    marginTop?: DimensionValue;
    /**
     * Setting `marginVertical` has the same effect as setting both `marginTop` and `marginBottom`.
     */
    marginVertical?: DimensionValue;
    /**
     * Setting `padding` has the same effect as setting each of `paddingTop`, `paddingBottom`, `paddingLeft`, and `paddingRight`.
     */
    padding?: DimensionValue;
    /**
     * The bottom padding, in pixels as a number or percentages as a string, of the UI element.
     */
    paddingBottom?: DimensionValue;
    /**
     * Equivalent to `paddingRight` when `direction` is `ltr`. Equivalent to `paddingLeft` when `direction` is `rtl`.
     */
    paddingEnd?: DimensionValue;
    /**
     * Setting `paddingHorizontal` has the same effect as setting both `paddingLeft` and `paddingRight`.
     */
    paddingHorizontal?: DimensionValue;
    /**
     * The left padding, in pixels as a number or percentages as a string, of the UI element.
     */
    paddingLeft?: DimensionValue;
    /**
     * The right padding, in pixels as a number or percentages as a string, of the UI element.
     */
    paddingRight?: DimensionValue;
    /**
     * Equivalent to `paddingLeft` when `direction` is `ltr`. Equivalent to `paddingRight` when `direction` is `rtl`.
     */
    paddingStart?: DimensionValue;
    /**
     * The top padding, in pixels as a number or percentages as a string, of the UI element.
     */
    paddingTop?: DimensionValue;
    /**
     * Setting `paddingVertical` has the same effect as setting both `paddingTop` and `paddingBottom`.
     */
    paddingVertical?: DimensionValue;
    /**
     * The position of the UI element. Similar to `position` in CSS, but everything is set to
     * `relative` by default, so `absolute` positioning is always relative to the parent.
     *
     * - `absolute` - The element's position is explicit and is taken out of the layout calculation.
     *
     * - `relative` - The element's position is relative to its normal position. This is the default value.
     */
    position?: 'absolute' | 'relative';
    /**
     * Controls the direction of the main axis, in which the children are stacked. Works like
     * `flex-direction` in CSS, except the default is `column`.
     *
     * - `column` - The children are placed in the vertical direction.
     *
     * - `column-reverse` - The children are placed in the vertical direction but in the opposite order.
     *
     * - `row` - The children are placed in the horizontal direction.
     *
     * - `row-reverse` - The children are placed in the horizontal direction but in the opposite order.
     */
    flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
    /**
     * Controls whether children can wrap around after they hit the end of a flex container.
     *
     * - `nowrap` - The children are displayed in one row or column.
     *
     * - `wrap` - The children are wrapped to multiple rows or columns if they do not fit in the container.
     *
     * - `wrap-reverse` - The children are wrapped to multiple rows or columns if they do not fit in the
     * container, with items appearing in the opposite order.
     */
    flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    /**
     * Aligns children in the main direction (along the main axis). For example, if children
     * are flowing vertically, `justifyContent` controls how they align vertically.
     *
     * - `flex-start` - The children are aligned toward the start of the container's main axis.
     *
     * - `flex-end` - The children are aligned toward the end of the container's main axis.
     *
     * - `center` - The children are centered within the container's main axis.
     *
     * - `space-between` - The space is equal between all children, inter-dependently.
     *
     * - `space-around` - The space is equal around all children.
     *
     * - `space-evenly` - The space is equal until each child is fully aligned, and so on.
     */
    justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    /**
     * Aligns rows or columns in the cross direction (perpendicular to the main axis). Only works
     * if `flexWrap` is enabled and there are multiple rows or columns.
     *
     * `flex-start` - The rows/columns are aligned toward the start of the container's cross axis.
     *
     * `flex-end` - The rows/columns are aligned toward the end of the container's cross axis.
     *
     * `center` - The rows/columns are centered within the container's cross axis.
     *
     * `stretch` - The height or width of the children is stretched to fit the container.
     *
     * `space-between` - The space is equal between all rows/columns.
     *
     * `space-around` - The space is equal around all rows/columns.
     */
    alignContent?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around';
    /**
     * Aligns children within a row or column in the cross direction (perpendicular to the main axis).
     * For example, if children are flowing vertically, `alignItems` controls how they align horizontally.
     *
     * - `flex-start` - The children are aligned toward the start of the container's cross axis.
     *
     * - `flex-end` - The children are aligned toward the end of the container's cross axis.
     *
     * - `center` - The children are aligned directly to the center of the container's cross axis.
     *
     * - `stretch` - The height or width of the children is stretched to fit the container.
     *
     * - `baseline` - The children are aligned to the baseline of the container.
     */
    alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
    /**
     * Controls how a child aligns in the cross direction (perpendicular to the main axis), overriding
     * the `alignItems` of the parent.
     *
     * - `auto` - The default behavior for the child depends on the `alignItems` of the container.
     *
     * - `flex-start` - The child is aligned toward the start of the container's cross axis.
     *
     * - `flex-end` - The child is aligned toward the end of the container's cross axis.
     *
     * - `center` - The child is aligned directly to the center of the container's cross axis.
     *
     * - `stretch` - The height or width of the child is stretched to fit the container.
     *
     * - `baseline` - The child is aligned to the baseline of the container.
     */
    alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
    /**
     * Controls how children are measured and displayed.
     *
     * - `hidden` - The element is clipped past the edge of the screen.
     *
     * - `visible` - The element is always visible.
     */
    overflow?: 'visible' | 'hidden';
    /**
     * `flex` does not work the same way as in CSS. `flex` is a number rather than a string.
     *
     * When `flex` is a positive number, the component is flexible and will be sized proportional
     * to its `flex` value. So a component with `flex` set to 2 will take twice the space as a
     * component with `flex` set to 1. `flex: X` (where X is a positive number) equates to
     * `flexGrow: X, flexShrink: 1, flexBasis: 0`.
     *
     * When `flex` is 0, the component is inflexible and is sized according to width and height.
     *
     * When `flex` is -1, the component is normally sized according to width and height. However,
     * if there's not enough space, the component will shrink to its `minWidth` and `minHeight`.
     */
    flex?: number;
    /**
     * Accepts a float number greater than or equal to 0. Describes how the remaining space in the
     * container should be distributed among its children along the main axis. After laying out its
     * children, a container will distribute any remaining space among its children weighted by the
     * children's `flexGrow` values.
     */
    flexGrow?: number;
    /**
     * Accepts a float number greater than or equal to 0. Describes how to shrink children along the
     * main axis when the total size of the children overflows the size of the container. A container
     * will shrink its children weighted by the children's `flexShrink` values.
     *
     * `flexShrink` is very similar to `flexGrow` and can be thought of in the same way if any
     * overflowing size is considered to be negative remaining space. These two properties also
     * work well together.
     */
    flexShrink?: number;
    /**
     * Specifies the default size of an item along the main axis of the container, that is, the size
     * of the item before any `flexGrow` and `flexShrink` calculations are performed.
     */
    flexBasis?: DimensionValue;
    /**
     * Controls the size of the undefined dimension of a component. It takes min/max dimensions
     * into account.
     *
     * If one of width/height is set, aspect ratio controls the size of the unset dimension.
     *
     * If flex basis/grow/shrink is set, aspect ratio controls the size of the node in the cross axis if unset.
     */
    aspectRatio?: number;
    /**
     * Controls which components display on top of others -- components with a larger `zIndex` will
     * render on top. If `zIndex` are not specified, components render according to their order in
     * the document tree -- later components draw over earlier ones. zIndex can be used if you don't
     * want this default behavior.
     */
    zIndex?: number;
    /**
     * The origin of the UI element when `position` is `absolute`, where [0, 0] is the top left of the
     * element and [1, 1] is the bottom right of the element.
     */
    layoutOrigin?: [number, number];
    /**
     * Specifies the directional flow of the user interface.
     *
     * - `inherit` - The child UI element inherits direction from its parent.
     *
     * - `ltr` - The child UI element faces to the left of the container (left-to-right).
     *
     * - `rtl` - The child UI element faces to the right of the container (right-to-left).
     */
    direction?: 'inherit' | 'ltr' | 'rtl';
};
/**
 * Represents the style of the borders on a UI element for a UI panel. For descriptions
 * of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#borderstyle | Custom UI Styles}.
 *
 * @remarks
 * The {@link UIComponent} class is the base class for controlling custom UI panels in a world. See {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/creating-a-custom-ui-panel | Create a custom UI panel}
 * for guides about using the API.
 */
export declare type BorderStyle = {
    /**
     * The color of the border. Accepts both CSS style color strings and Color objects.
     */
    borderColor?: Bindable<ColorValue>;
    /**
     * The radius, in pixels, of the border.
     */
    borderRadius?: Bindable<number>;
    /**
     * The radius of the bottom left corner, in pixels.
     */
    borderBottomLeftRadius?: Bindable<number>;
    /**
     * The radius of the bottom right corner, in pixels.
     */
    borderBottomRightRadius?: Bindable<number>;
    /**
     * The radius of the top left corner, in pixels.
     */
    borderTopLeftRadius?: Bindable<number>;
    /**
     * The radius of the top right corner, in pixels.
     */
    borderTopRightRadius?: Bindable<number>;
    /**
     * The width, in pixels, of the border.
     */
    borderWidth?: Bindable<number>;
    /**
     * The width, in pixels, of the bottom border.
     */
    borderBottomWidth?: Bindable<number>;
    /**
     * Equivalent to `borderRightWidth` when `direction` is `ltr`. Equivalent to `borderLeftWidth` when `direction` is `rtl`.
     */
    borderEndWidth?: Bindable<number>;
    /**
     * The width, in pixels, of the left border.
     */
    borderLeftWidth?: Bindable<number>;
    /**
     * The width, in pixels, of the right border.
     */
    borderRightWidth?: Bindable<number>;
    /**
     * Equivalent to `borderLeftWidth` when `direction` is `ltr`. Equivalent to `borderRightWidth` when `direction` is `rtl`.
     */
    borderStartWidth?: Bindable<number>;
    /**
     * The width, in pixels, of the top border.
     */
    borderTopWidth?: Bindable<number>;
};
/**
 * Represents the style of a UI element's shadow on a custom UI panel. For descriptions
 * of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#shadowstyle | Custom UI Styles}.
 *
 * @remarks
 * The {@link UIComponent} class is the base class for controlling custom UI panels in a world. See {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/creating-a-custom-ui-panel | Create a custom UI panel}
 * for guides about using the API.
 */
export declare type ShadowStyle = {
    /**
     * The drop color of the shadow. Accepts both CSS style color strings and Color objects.
     */
    shadowColor?: Bindable<ColorValue>;
    /**
     * The falloff function, or fading, of the shadow.
     *
     * - `linear` - The shadow fades linearly along the distance.
     *
     * - `sqrt` - The shadow fades exponentially as the square root of the distance from the shape.
     *
     * - `sigmoid` - The shadow fades exponentially in the distance from the shape.
     */
    shadowFalloff?: 'linear' | 'sqrt' | 'sigmoid';
    /**
     * The offset of the shadow, in pixels, in [x, y] format.
     */
    shadowOffset?: [number, number];
    /**
     * The opacity of the shadow. The number is multiplied by the color's alpha component,
     * and should be in the range from 0.0 to 1.0.
     */
    shadowOpacity?: Bindable<number>;
    /**
     * The blur radius, in pixels, of the shadow.
     */
    shadowRadius?: number;
    /**
     * The radius, in pixels, by which the shadow expands or shrinks under the component. May take a negative number.
     */
    shadowSpreadRadius?: number;
};
/**
 * Represents the style used to transform a UI element on a UI panel. For descriptions
 * of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#transformstyle | Custom UI Styles}.
 *
 * @remarks
 * The {@link UIComponent} class is the base class for controlling custom UI panels in a world. See {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/creating-a-custom-ui-panel | Create a custom UI panel}
 * for guides about using the API.
 */
export declare type TransformStyle = {
    /**
     * `transform` accepts an array of transformation objects. Each object specifies the property that
     * will be transformed as the key, and the value to use in the transformation.
     *
     * - `rotate` - Rotate the element around the `transformOrigin`. Value requires a string
     * expressed in degrees (e.g. `'45deg'`) or radians (e.g. `'0.7854rad'`).
     *
     * - `scale` - Scale the element uniformly by the given multiplier, with the `transformOrigin` being
     * the fixed point. Equivalent to providing the same value to both `scaleX` and `scaleY`.
     *
     * - `scaleX` - Scale the element horizontally by the given multiplier.
     *
     * - `scaleY` - Scale the element vertically by the given multiplier.
     *
     * - `translate` - Move the element by the given x and y values, in pixels, in [x, y] format. Equivalent to providing
     * the values to `translateX` and `translateY` independently.
     *
     * - `translateX` - Move the element horizontally by the given value in pixels.
     *
     * - `translateY` - Move the element vertically by the given value in pixels.
     *
     * - `skewX` - Skew the element horizontally by the given angle, represented in degrees or radians.
     *
     * - `skewY` - Skew the element vertically by the given angle, represented in degrees or radians.
     */
    transform?: Array<{
        rotate: Bindable<string>;
    } | {
        scale: Bindable<number>;
    } | {
        scaleX: Bindable<number>;
    } | {
        scaleY: Bindable<number>;
    } | {
        translate: [Bindable<number>, Bindable<number>];
    } | {
        translateX: Bindable<number>;
    } | {
        translateY: Bindable<number>;
    } | {
        skewX: Bindable<string>;
    } | {
        skewY: Bindable<string>;
    }>;
    /**
     * The origin point of the transform, specified as an [x, y] array, where [0, 0] denotes the top left corner of the UI element.
     * Each component can be a number in pixels or a percentage string. The default is `['50%', '50%']`.
     */
    transformOrigin?: [DimensionValue, DimensionValue];
};
/**
 * Represents the styles of a {@link View} component on a UI panel. For descriptions
 * of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#viewstyle | Custom UI Styles}.
 *
 * @remarks
 * The {@link UIComponent} class is the base class for controlling custom UI panels in a world. See {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/creating-a-custom-ui-panel | Create a custom UI panel}
 * for guides about using the API.
 */
export declare type ViewStyle = LayoutStyle & BorderStyle & ShadowStyle & TransformStyle & {
    /**
     * The background color of the component. Accepts both CSS style color strings and Color objects.
     */
    backgroundColor?: Bindable<ColorValue>;
    /**
     * Controls whether to render the background behind the border. Useful when the border color is transparent.
     *
     * - `border-box` - The background is clipped by a box that includes the border.
     *
     * - `padding-box` - The background is clipped by a box inside the border.
     */
    backgroundClip?: 'border-box' | 'padding-box';
    /**
     * Set an opacity for the component. The number should be in the range from 0.0 to 1.0.
     */
    opacity?: Bindable<number>;
    /**
     * The starting color of the gradient background. Accepts both CSS style color strings and Color objects.
     */
    gradientColorA?: Bindable<ColorValue>;
    /**
     * The ending color of the gradient background. Accepts both CSS style color strings and Color objects.
     */
    gradientColorB?: Bindable<ColorValue>;
    /**
     * The x component of the starting position (corresponding to `gradientColorA`) of the gradient background.
     * The value is a percentage as a number (from 0.0 to 1.0) or a string (from '0%' to '100%').
     */
    gradientXa?: number | string;
    /**
     * The y component of the starting position (corresponding to `gradientColorA`) of the gradient background.
     * The value is a percentage as a number (from 0.0 to 1.0) or a string (from '0%' to '100%').
     */
    gradientYa?: number | string;
    /**
     * The x component of the ending position (corresponding to `gradientColorB`) of the gradient background.
     * The value is a percentage as a number (from 0.0 to 1.0) or a string (from '0%' to '100%').
     */
    gradientXb?: number | string;
    /**
     * The y component of the ending position (corresponding to `gradientColorB`) of the gradient background.
     * The value is a percentage as a number (from 0.0 to 1.0) or a string (from '0%' to '100%').
     */
    gradientYb?: number | string;
    /**
     * The gradient direction, pointing from the ending position to the starting position (`gradientColorA` is
     * in the direction of `gradientAngle`). Default is `'0deg'`, which is equivalent to `gradientYa: 0, gradientYb: 1`.
     * The value is represented in degrees.
     */
    gradientAngle?: string;
};
/**
 * Represents the props of a {@link View} component.
 */
export declare type ViewProps = {
    /**
     * The nested children components. Can be a single UINode or an array of UINodes.
     */
    children?: UIChildren;
    /**
     * The style applied to the component.
     */
    style?: ViewStyle;
};
/**
 * Creates a view component for a UI panel.
 *
 * @remarks
 * A view is a container for UI components and supports a parent-child
 * relationship with other components. Views support multiple styles including
 * flex layouts.
 *
 * The {@link UIComponent} class is the base class for controlling custom UI panels in a world. See {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/creating-a-custom-ui-panel | Create a custom UI panel}
 * for guides about using the API.
 *
 * @param props - The props that define the child components and style of the
 * view.
 * @returns A UINode representing the View component.
 */
export declare function View(props: Readonly<ViewProps>): UINode<ViewProps>;
/**
 * Defines the available fonts for a {@link Text_2 | Text} component in a UI panel.
 *
 * @remarks
 * For descriptions of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#textstyle | Custom UI Styles}.
 */
export declare type FontFamily = 'Anton' | 'Bangers' | 'Kallisto' | 'Optimistic' | 'Oswald' | 'Roboto' | 'Roboto-Mono';
/**
 * Represents the styles of a {@link Text_2 | Text} component in a UI panel.
 *
 * @remarks
 * For descriptions of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#textstyle | Custom UI Styles}.
 */
export declare type TextStyle = ViewStyle & {
    /**
     * The color of the text. Accepts both CSS style color strings and Color objects.
     */
    color?: Bindable<ColorValue>;
    /**
     * The {@link FontFamily | font family} of the text.
     */
    fontFamily?: FontFamily;
    /**
     * The font size, in pixels, of the text.
     */
    fontSize?: Bindable<number>;
    /**
     * The font weight. Not all fonts have all the weight variations. If the specified weight does not exist,
     * it will fallback to the closest one.
     */
    fontWeight?: Bindable<'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'>;
    /**
     * The spacing between the characters of the text.
     */
    letterSpacing?: number;
    /**
     * The height, in pixels, of each line of text.
     */
    lineHeight?: number;
    /**
     * The alignment of the text.
     *
     * - `auto` - The text is aligned according to the styles of the container.
     *
     * - `left` - The text is aligned to the left.
     *
     * - `right` - The text is aligned to the right.
     *
     * - `center` - The text is centered within its container.
     */
    textAlign?: 'auto' | 'left' | 'right' | 'center';
    /**
     * The vertical alignment of the text.
     *
     * - `auto` - The text is vertically aligned according to the styles of the container.
     *
     * - `top` - The text is positioned above the container's baseline.
     *
     * - `bottom` - The text is positioned below the container's baseline.
     *
     * - `center` - The text is centered.
     */
    textAlignVertical?: 'auto' | 'top' | 'bottom' | 'center';
    /**
     * Additional text decorations.
     *
     * - `none` - No additional decoration.
     *
     * - `underline` - The text displays an underline.
     *
     * - `line-through` - The text displays a line through the element.
     *
     * - `underline line-through` - The text displays an underline and a line through the element.
     */
    textDecorationLine?: Bindable<'none' | 'underline' | 'line-through' | 'underline line-through'>;
    /**
     * The color of the text shadow. Text shadow is only drawn when `textShadowOffset` is set.
     */
    textShadowColor?: Bindable<ColorValue>;
    /**
     * The offset of the text shadow, in pixels, in [x, y] format.
     */
    textShadowOffset?: [number, number];
    /**
     * The blur radius of the text shadow. Text shadow is only drawn when `textShadowOffset` is set.
     */
    textShadowRadius?: number;
    /**
     * Additional space if needed for justification.
     *
     * - `normal` - Extra spacing is added after the last character.
     *
     * - `pre-line` - Extra spacing is added before the text starts (i.e. before the first character).
     *
     * - `pre-wrap` - Extra spacing is added between characters.
     */
    whiteSpace?: 'normal' | 'pre-line' | 'pre-wrap';
};
/**
 * Represents the props of a {@link Text_2 | text} component.
 */
export declare type TextProps = {
    /**
     * The text to display.
     */
    text: Bindable<string | LocalizableText>;
    /**
     * The number of lines to display. If the text is too long, it will be truncated with ellipsis at the end.
     */
    numberOfLines?: number;
    /**
     * The style applied to the component.
     */
    style?: TextStyle;
};
/**
 * Creates a Text component.
 *
 * For information about usage, see the
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/tutorials/tutorial-worlds/custom-ui-examples-tutorial/station-1-text-and-fonts | Text and Fonts}
 * section of the Custom UI Examples tutorial.
 *
 * @param props - The props of the Text component.
 * @returns A UINode representing the Text component.
 */
export declare function Text(props: Readonly<TextProps>): UINode<TextProps>;
/**
 * Represents the different set of Avatar Expressions you can request an image of.
 * Use with ImageSource.fromPlayerAvatarExpression
 */
export declare enum AvatarImageExpressions {
    Neutral = "Neutral",
    Happy = "Happy",
    Sad = "Sad",
    Angry = "Angry",
    TeeHee = "TeeHee",
    Congrats = "Congrats",
    Shocked = "Shocked",
    Waving = "Waving"
}
/**
 * Represents the styles of an {@link Image_2 | Image} component in a UI panel.
 *
 * @remarks
 * For descriptions of the available styles, see
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/desktop-editor/custom-ui/api-reference-for-custom-ui#imagestyle | Custom UI Styles}.
 */
export declare type ImageStyle = ViewStyle & {
    /**
     * How the image is resized when it is drawn.
     *
     * - `cover` - Scale the image uniformly (maintain the aspect ratio) so that at least one of width and height will be equal to the corresponding dimension of the view, and the other will be larger.
     *
     * - `contain` - Scale the image uniformly (maintain the aspect ratio) so that both width and height will be equal to or less than the corresponding dimension of the view.
     *
     * - `stretch` - Scale width and height independently, which may change the aspect ratio of the source.
     *
     * - `center` - Center the image in the view along both dimensions. If the image is larger than the view, scale it down uniformly so that it is contained in the view.
     *
     * - `repeat` - Repeat the image to cover the frame of the view. The image will keep its size and aspect ratio if it is smaller than the view, and will be scaled down uniformly so that it is contained in the view if it is larger than the view.
     */
    resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'repeat';
    /**
     * Changes the color of all the non-transparent pixels to the `tintColor`.
     */
    tintColor?: Bindable<ColorValue>;
    /**
     * Changes how the tint color is applied to the original image source.
     *
     * - `multiply` - The tint is applied to the layer mask using the values of the layer mask.
     *
     * - `replace` - The tint is applied to the source image, ignoring the layer mask.
     */
    tintOperation?: 'replace' | 'multiply';
};
/**
 * Represents the source of an image used by an {@link Image_2 | image} component.
 *
 * @remarks
 * In order to apply an image to an image component, the image must be uploaded to
 * your asset library as a PNG.
 *
 * For information about usage, see the
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/tutorials/tutorial-worlds/custom-ui-examples-tutorial/station-2-image-from-asset | Image from Asset}
 * section of the Custom UI Examples tutorial.
 */
export declare class ImageSource {
    /**
     * Gets an image based on a texture asset.
     * @param texture - The texture asset to use as the source.
     * @returns The image source for the given texture asset.
     */
    static fromTextureAsset(texture: TextureAsset): ImageSource;
    /**
     * Gets an image based on the player's avatar and expression.
     * @remarks
     * Only works on Client. Make sure your Custom UI panel and script is local.
     *
     * @param player - The player to retrieve the avatar for.
     * @param expression - The expression to retrieve.
     * @returns The image source for the given avatar and expression.
     */
    static fromPlayerAvatarExpression(player: Player, expression: AvatarImageExpressions): ImageSource;
}
/**
 * Represents the props of an {@link Image_2 | Image} component.
 */
export declare type ImageProps = {
    /**
     * The source of the image, can either be null or constructed from the static methods of the `ImageSource` class.
     * Currently supported sources include remote URL and Texture Asset.
     */
    source?: Bindable<ImageSource | null>;
    /**
     * The style applied to the component.
     */
    style?: ImageStyle;
};
/**
 * Creates an Image component for a UI panel.
 *
 * @remarks
 * You can use the {@link ImageSource} class to define the source of an image asset. For
 * information about usage, see the
 * {@link https://developers.meta.com/horizon-worlds/learn/documentation/tutorials/tutorial-worlds/custom-ui-examples-tutorial/station-2-image-from-asset | Image from Asset}
 * section of the Custom UI Examples tutorial.
 *
 * @param props - The props of the Image component.
 * @returns A `UINode` object representing the Image component.
 */
export declare function Image(props: Readonly<ImageProps>): UINode<ImageProps>;
/**
 * Represents the props of a {@link Pressable | pressable} component on a UI panel.
 */
export declare type PressableProps = {
    /**
     * The nested children {@link Component | components}. Can be a single
     * {@link UINode} or an array of UINodes.
     */
    children?: UIChildren;
    /**
     * Indicates whether the component is disabled. If `true`, `onClick` and `onRelease` callbacks are disabled. Defaults is `false`.
     */
    disabled?: Bindable<boolean>;
    /**
     * Called immediately after `onRelease`.
     */
    onClick?: Callback;
    /**
     * Called when the player moves the raycast or the mouse into the component.
     */
    onEnter?: Callback;
    /**
     * Called when the player moves the raycast or the mouse out of the component.
     */
    onExit?: Callback;
    /**
     * Called when the player presses down the controller trigger or the mouse.
     */
    onPress?: Callback;
    /**
     * Called when the player releases the controller trigger or the mouse.
     */
    onRelease?: Callback;
    /**
     * Events propagate to the parent by default. If `false`, event propagations are stopped.
     */
    propagateClick?: boolean;
    /**
     * The style applied to the component.
     */
    style?: ViewStyle;
};
/**
 * Creates a Pressable component in a UI panel, which is an interactive component
 * that can receive player input events.
 *
 * @param props - The props of the Pressable component.
 * @returns A `UINode` object representing the Pressable component.
 */
export declare function Pressable(props: Readonly<PressableProps>): UINode<PressableProps>;
/**
 * Represents the props of a {@link ScrollView} component, which is a scrollable
 * version of a {@link View} component. It supports horizontal and vertical
 * scrolling, as well as distinct styling for the view itself and underlying
 * content wrapper.
 */
export declare type ScrollViewProps = ViewProps & {
    /**
     * The styles to apply to the scroll view content container that
     * wraps all of the child views.
     */
    contentContainerStyle?: ViewStyle;
    /**
     * When true, the scroll view's children are arranged horizontally in a row instead of vertically in a column. The
     * default value is false.
     */
    horizontal?: boolean;
};
/**
 * Creates a ScrollView {@link Component | component} in a UI panel.
 *
 * @param props - The props of the ScrollView component.
 * @returns A `UINode` representing the ScrollView component.
 */
export declare function ScrollView(props: Readonly<ScrollViewProps>): UINode<ScrollViewProps>;
/**
 * Represents the props of a {@link DynamicList} component in a UI panel.
 */
export declare type DynamicListProps<T> = {
    data: Binding<T[]>;
    renderItem: (item: T, index?: number) => UINode;
    style?: ViewStyle;
};
/** Creates a DynamicList component.
 * @param props - Props of the DynamicList component.
 * @returns A UINode representing the DynamicList component.
 */
export declare function DynamicList<T>(props: Readonly<DynamicListProps<T>>): UINode<DynamicListProps<T>>;
export {};

}