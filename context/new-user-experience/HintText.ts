import * as hz from "horizon/core";
import * as ui from "horizon/ui";

/**
 * HintText.ts
 *
 * Summary:
 * This component handles displaying notification messages to players in the game world.
 * It supports different notification layouts based on message length and presence of title.
 *
 * Works with:
 * - HintTextTrigger.ts - Displays the notification text.
 *
 * Setup:
 * - There are three UI ready for three players, if you want more players, then duplicate the component and change playerIndex value to the next number
 * - Configure properties like playerIndex, openSFX, closeSFX, and font sizes in the editor.
 * 
 * Additional notes:
 * - Dynamic font sizing based on message length
 * - Different UI layouts for various notification types
 * - Countdown timer support for time-sensitive notifications
 * - Customizable background colors
 * - Device-specific UI adjustments (mobile vs desktop)
 */

/**
 * Network event for sending notifications to players
 * @param player - Array of players who should receive the notification
 * @param title - Title text for the notification (can be empty)
 * @param message - Main message content
 * @param time - Duration in seconds to display the notification
 * @param bgColor - Background color for the notification UI
 */
export const UIEvents = {
	notification: new hz.NetworkEvent<{ player: [hz.Player]; title: string; message: string; time: number; bgColor: string }>("notification"),
};

class HintText extends ui.UIComponent<typeof HintText> {
	static propsDefinition = {
		playerIndex: { type: hz.PropTypes.Number, default: 0 }, 		  // Index of the player this component belongs to
		openSFX: { type: hz.PropTypes.Entity },		 					  // Sound effect entity to play when notification opens
		closeSFX: { type: hz.PropTypes.Entity },		 				  // Sound effect entity to play when notification closes
		// Font size properties for different message lengths
		smallTitleFontSize: { type: hz.PropTypes.Number, default: 28 },   // Font size for short titles
		smallMessageFontSize: { type: hz.PropTypes.Number, default: 16 }, // Font size for short messages
		normalTitleFontSize: { type: hz.PropTypes.Number, default: 28 },  // Font size for normal titles
		normalMessageFontSize: { type: hz.PropTypes.Number, default: 14 },// Font size for normal messages
		bigTitleFontSize: { type: hz.PropTypes.Number, default: 28 },	  // Font size for big titles
		bigMessageFontSize: { type: hz.PropTypes.Number, default: 12 },	  // Font size for big messages
	};


	private owner: hz.Player = hz.Player.prototype;
	private countdownActive = false;
	
	// UI Bindings for displaying notification content
	private messageBinding = new ui.Binding<string>("");
	private messageActiveBinding = new ui.Binding<boolean>(false);
	private titleBinding = new ui.Binding<string>("");
	private hideBottomUIBinding = new ui.Binding<boolean>(false);
	private hideNotificationUIBinding = new ui.Binding<boolean>(false);
	
	// Layout bindings - only one should be active at a time
	// These determine which notification layout/style to use
	private notification_1_line_small_binding = new ui.Binding<boolean>(false); // Short messages without title
	private notification_1_line_binding = new ui.Binding<boolean>(false);       // Medium messages without title
	private notification_2_line_binding = new ui.Binding<boolean>(false);       // Long messages without title
	private notification_big_binding = new ui.Binding<boolean>(false);          // Long messages with title
	private notification_normal_binding = new ui.Binding<boolean>(false);       // Medium messages with title
	private notification_small_binding = new ui.Binding<boolean>(false);        // Short messages with title
	
	private currentTimeout: number | null = null;
	private playerDevice: string = "";

	// Notification styling properties
	private backgroundColor: string = "#0288d1"; // Default background color
	private titleFontSize: number = 44;            // Dynamic - set from props based on message length
	private messageFontSize: number = 32;          // Dynamic - set from props based on message length
	
	/**
	 * Lifecycle method called when the component is initialized.
	 * Sets up event listeners for player entering the world and initializes properties.
	 */
	start() {
		this.owner = this.entity.owner.get();
		this.connectCodeBlockEvent(this.entity, hz.CodeBlockEvents.OnPlayerEnterWorld, (player) => this.onPlayerEnterWorld(player));

		if (this.owner !== this.world.getServerPlayer() && this.owner.index.get() === this.props.playerIndex) {
			this.subscribeEvents();
		}
	}

	/**
	 * Listens for the UIEvents.notification event and handles incoming notification data.
	 */
	private subscribeEvents() {
		this.connectNetworkBroadcastEvent(UIEvents.notification, this.notification.bind(this));
	}

	/**
	 * Handles player entering the world.
	 * Automatically assigns the player based on their index and sets them as the owner of this component.
	 * 
	 * @param player - The player who entered the world
	 */
	private onPlayerEnterWorld(player: hz.Player) {
		this.async.setTimeout(() => {
			if (this.props.playerIndex <= this.world.getPlayers().length) {
				const playerFromIndex = this.world.getPlayerFromIndex(this.props.playerIndex);
				if (player === playerFromIndex) {
					this.entity.owner.set(player);
					this.owner = player;
				}
			}
		}, 1000);
	}

	/**
	 * Main notification handler - processes incoming notification data
	 * @param data - Notification data containing player list, title, message, time, and background color
	 */
	private notification(data: { player: hz.Player[]; title: string; message: string; time: number, bgColor: string }): void {
		if (!this.owner) {
			console.warn("Owner not defined yet when notification was received");
			return;
		}
		this.backgroundColor = data.bgColor;
		const player = data.player.find((p) => p.id === this.owner.id);		
		if (!data.message) return;
		this.handleNotification({ ...data, size: "default" });
	}

	/**
	 * Core notification display logic
	 * 
	 * This method:
	 * 1. Handles countdown timers for time-sensitive notifications
	 * 2. Determines which notification layout to use based on message length
	 * 3. Sets appropriate font sizes for optimal readability
	 * 4. Manages notification timing and auto-dismissal
	 * 
	 * @param data - Processed notification data
	 */
	private handleNotification(data: { player: hz.Player[]; size: string; title: string; message: string; time: number;}): void {
		if (!data.player.some((player) => player.id === this.owner.id)) return;
		const { title, message } = data;
		
		let remainingTime: number | null = null;
		
		// Check if this is a countdown notification (format: "Countdown: X")
		const countdownMatch = message.match(/^Countdown: (\d+)$/);
		if (countdownMatch) {
			remainingTime = parseInt(countdownMatch[1], 10);

			// If countdown is already active, just update the message
			if (this.countdownActive) {
				this.messageBinding.set(message);
				return;
			}

			this.countdownActive = true;
		}

		// Initialize notification display
		this.messageActiveBinding.set(true);
		this.hideNotificationUIBinding.set(true);
		this.messageBinding.set(message || "");
		this.titleBinding.set(title || "");
		
		// Reset all layout bindings before setting the appropriate one
		this.notification_1_line_small_binding.set(false);
		this.notification_1_line_binding.set(false);
		this.notification_2_line_binding.set(false);
		this.notification_big_binding.set(false);
		this.notification_normal_binding.set(false);
		this.notification_small_binding.set(false);
		if (this.props.openSFX) this.props.openSFX.as(hz.AudioGizmo)?.play({fade:0, players: data.player });

		const messageLength = message.length;
		
		/**
		 * Layout Selection Logic:
		 * 
		 * Based on message length, determines which notification layout to use
		 * and sets appropriate font sizes for optimal readability.
		 * 
		 * Current logic :
		 * - messageLength < 50: Small layout (uses smallTitleFontSize and smallMessageFontSize props)
		 * - messageLength < 100: Normal layout (uses normalTitleFontSize and normalMessageFontSize props)  
		 * - messageLength >= 100: Big layout (uses bigTitleFontSize and bigMessageFontSize props)
		 * 
		 * Note: Font sizes decrease as message length increases to ensure text fits
		 */
		if (messageLength < 50) {
			this.notification_small_binding.set(true);
			this.titleFontSize = this.props.smallTitleFontSize;
			this.messageFontSize = this.props.smallMessageFontSize;
		} else if (messageLength < 100) {
			this.notification_normal_binding.set(true);
			this.titleFontSize = this.props.normalTitleFontSize;
			this.messageFontSize = this.props.normalMessageFontSize;
		} else {
			this.notification_big_binding.set(true);
			this.titleFontSize = this.props.bigTitleFontSize;
			this.messageFontSize = this.props.bigMessageFontSize;
			
		}
		
		// Clear any existing timeout to prevent multiple notifications overlapping
		if (this.currentTimeout) this.async.clearTimeout(this.currentTimeout);

		// Handle device-specific UI adjustments
		if (this.playerDevice === "mobile") {
			this.hideBottomUIBinding.set(true);
		} else {
			this.hideBottomUIBinding.set(false);
		}

		/**
		 * Notification auto-dismissal logic
		 * 
		 * Sets up a timeout to automatically hide the notification after the specified duration.
		 * Handles cleanup of UI state and triggers close sound effect.
		 */
		const closeNotification = (delay: number) => {
			this.currentTimeout = this.async.setTimeout(() => {
				if (!this.messageActiveBinding["_globalValue"]) return;
				this.messageActiveBinding.set(false);
				if (this.playerDevice !== "mobile") this.hideBottomUIBinding.set(true);
				this.hideNotificationUIBinding.set(false);
				this.messageBinding.set("");
				this.titleBinding.set("");
				this.countdownActive = false;
				this.currentTimeout = null;
				if (this.props.closeSFX) this.props.closeSFX.as(hz.AudioGizmo)?.play({fade:0, players: data.player });
			}, delay);
		};

		// Special handling for countdown notifications ending
		if (remainingTime !== null && remainingTime === 1) {
			closeNotification(data.time * 1000);
			return;
		}

		// Standard notification timing
		if (remainingTime === null) closeNotification(data.time * 1000);
	}

	/**
	 * Renders the notification content (title and message)
	 * 
	 * This method creates the UI elements for displaying the notification text.
	 * It conditionally renders title and message based on whether they have content.
	 * Font sizes are dynamically set based on the current titleFontSize and messageFontSize values.
	 * 
	 * @returns UI.View containing the notification text elements
	 */
	private notificationsUI() {
		return ui.View({
			children: [
				ui.UINode.if(
					this.hideNotificationUIBinding.derive((tex) => !!tex && !isNaN(Number(tex))),
					ui.View({
						children: [
							// Title text - only shown if title is not empty
							ui.UINode.if(
								this.titleBinding.derive((title) => title.trim() !== ""),
								ui.Text({
									text: this.titleBinding.derive((title) => title.toString()),
									style: {
										fontSize: this.titleFontSize,
										fontWeight: "bold",
										color: "#FFFFFF",
										textAlign: "center",
									},
								}),
							),
							// Message text - only shown if message is not empty
							ui.UINode.if(
								this.messageBinding.derive((message) => message.trim() !== ""),
								ui.Text({
									text: this.messageBinding.derive((message) => message.toString()),
									style: {
										fontSize: this.messageFontSize,
										color: "#FFFFFF",
										textAlign: "center",
									},
								}),
							),
						],
					}),
				),
			],
		});
	}

	/**
	 * Main UI initialization method
	 * 
	 * Creates the root notification container with:
	 * - Centered positioning with top margin
	 * - Responsive width (max 600px)
	 * - Rounded corners (top-left and bottom-right)
	 * - Dynamic background color
	 * - Padding and shadow effects
	 * 
	 * The notification is only visible when hideNotificationUIBinding is true.
	 * 
	 * @returns UI.View - The complete notification UI structure
	 */
	initializeUI() {
		return ui.View({
			style: {
				width: "100%",
				height: "100%",
				alignItems: "center",
				justifyContent: "center",
				marginTop: 200,
			},
			children: [
				ui.UINode.if(
					this.hideNotificationUIBinding,
					ui.View({
						style: {
							maxWidth: 600,
							width: "100%",
							//height: 50,
							justifyContent: "center",
							alignItems: "center",
							borderTopLeftRadius: 20,
							borderBottomRightRadius: 20,
							backgroundColor:  this.backgroundColor,  // Dynamic background color
							paddingHorizontal: 20,
							paddingVertical: 10,
							borderWidth: 0,
							borderColor: "#FF8C00",
							shadowColor: "#000",
						},
						children: this.notificationsUI(),
					}),
				),
			],
		});
	}
}

// Register the component so it can be used in the world
ui.UIComponent.register(HintText);
