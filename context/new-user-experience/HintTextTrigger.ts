import * as hz from "horizon/core";

/**
 * HintTextTrigger.ts
 * 
 * Summary:
 * Displays a hint text notification to players when they enter a specific trigger area.
 * 
 * Works with:
 *  - HintText.ts - Handles the UI for displaying notifications.
 * 
 * Setup:
 * - Create an empty object and add this script.
 * - Set the customTitle and customMessage properties to define the notification content.
 * - Set the amountTime property to define how long the notification should be displayed.
 */
export const UIEvents = {
	notification: new hz.NetworkEvent<{ player: [hz.Player]; title: string; message: string; time: number }>("notification"),
};

class HintTextTrigger extends hz.Component<typeof HintTextTrigger> {
	static propsDefinition = {
		customTitle: { type: hz.PropTypes.String, default: "" }, 						// Title of the notification
		customMessage: { type: hz.PropTypes.String, default: "Welcome to the world!" }, // Message of the notification
		amountTime: { type: hz.PropTypes.Number, default: 5 }, 							// Duration the notification is displayed
	};

	/**
	 * Lifecycle method called when the component is initialized.
	 * Sends a network broadcast event to display the notification.
	 */
	start() {
		this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterTrigger, (enteredBy: hz.Player) => {
			this.sendNetworkBroadcastEvent(UIEvents.notification, { player: [enteredBy], title: this.props.customTitle, message: this.props.customMessage, time: this.props.amountTime });
		});
	}
}
// Register the component so it can be used in the world
hz.Component.register(HintTextTrigger);
