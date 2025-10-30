import {Asset, PropTypes} from 'horizon/core';
import {Binding, Image, ImageSource, Pressable, Text, UIComponent, UINode, View} from "horizon/ui";
import { TutorialImageInfo } from 'TutorialImageInfo';


/**
 * TutorialUIController.ts
 * 
 * Summary:
 * Displays a customizable panel consisting of an image, message, and an optional close button. 
 * It also supports animated image sequences and is designed to be highly configurable through properties.
 * 
 * Works with:
 * - TutorialImageInfo.ts - Represents a sprite with an image ID and order for display purposes.
 * 
 * Setup:
 * - This script comes with some predefined images for VR controls. If you want to use them, toggle any of the
 * 'isPredefinedXXXX' properties. Only one can be active.
 * - To animate a sequence, you have to add one empty object as a child of this entity and attach 'TutorialImageInfo.ts'.
 * - Colors are string so you can use transparency using RGBA values. It also supports hexadecimal (#fff) and
 *    specific colors ('red').
 **/

class TutorialUIController extends UIComponent<typeof TutorialUIController> {
  //#region Component Properties
  static propsDefinition = {
    isAnimated: {type: PropTypes.Boolean, default: false},                    //Enables or disables animation for the image.
    isImageLeft: {type: PropTypes.Boolean, default: true},                    //Determines if the image is displayed on the left. 'false' means right.
    spriteFrequency: {type: PropTypes.Number, default: 0.25},                 //Frequency of image animation in seconds.
    // Border
    borderColor: {type: PropTypes.String, default: '#ffffff'},              //Border color of the panel.
    borderWidth: {type: PropTypes.Number, default: 1},                        //Border width of the panel.
    borderRadius: {type: PropTypes.Number, default: 10},                      //Border radius of the panel.
    // Title
    titleColor: {type: PropTypes.String, default: '#000'},                    //Font color of the title.
    titleFontSize: {type: PropTypes.Number, default: 20},                     //Font size of the title text.
    titleCenterAligned: {type: PropTypes.Boolean, default: true},             //Determines if the title text is center-aligned.
    // Separator
    separatorColor: {type: PropTypes.String, default: '#000'},                //Color of the separator line.
    separatorWidth: {type: PropTypes.String, default: '100%'},                //Width of the separator line.
    separatorHeight: {type: PropTypes.Number, default: 1},                    //Height of the separator line in pixels.
    separatorMarginBottom: {type: PropTypes.Number, default: 10},             //Margin below the separator line in pixels.
    // Message
    messageColor: {type: PropTypes.String, default: '#000'},                  //Font color of the message.
    messageFontSize: {type: PropTypes.Number, default: 16},                   //Font size of the message text.
    messageCenterAligned: {type: PropTypes.Boolean, default: true},           //Determines if the message text is center-aligned.
    // Background
    backgroundColor: {type: PropTypes.String, default: '#c59f71'},          //Background color of the panel.
    backgroundOpacity: {type: PropTypes.Number, default: 1},                  //Opacity level of the background (0-1).
    // Close Button
    showCloseButton: {type: PropTypes.Boolean, default: true},                //Specifies if a close button should be displayed.
    closeFontSize: {type: PropTypes.Number, default: 16},                     //Font size of the close button label.
    closeBackgroundColor: {type: PropTypes.String, default: '#950303'},    //Background color of the close button.
    closeColor: {type: PropTypes.String, default: '#ffffff'},              //Font color of the close button label.
    // Default settings
    initialImage: {type: PropTypes.String},                                  //Specifies the initial image source to display (optional).
    initialTitle: {type: PropTypes.String, default: 'Title'},                //Initial text for the title.
    initialMessage: {type: PropTypes.String, default: 'This is a message!'}, //Initial message content.
    // Predefined images
    isPredefinedButtonA: {type: PropTypes.Boolean, default: false},          //Predefined images for button A.
    isPredefinedButtonB: {type: PropTypes.Boolean, default: false},          //Predefined images for button B.
    isPredefinedButtonX: {type: PropTypes.Boolean, default: false},          //Predefined images for button X.
    isPredefinedButtonY: {type: PropTypes.Boolean, default: false},          //Predefined images for button Y.
    isPredefinedTriggerLeft: {type: PropTypes.Boolean, default: false},      //Predefined images for left trigger.
    isPredefinedTriggerRight: {type: PropTypes.Boolean, default: false},     //Predefined images for right trigger.
    isPredefinedDownLeft: {type: PropTypes.Boolean, default: false},         //Predefined images for left down button.
    isPredefinedDownRight: {type: PropTypes.Boolean, default: false},        //Predefined images for right down button.
  };
  
  //#endregion
  
  // Width of the UI panel
  panelWidth = 1000;
  // Height of the UI panel
  panelHeight = 300;
  
  // Bindings for dynamic properties
  private titleBinding = new Binding<string>('');
  private messageBinding = new Binding<string>('');
  private imageBinding = new Binding<ImageSource | null>(null);
  private showCloseButtonBinding = new Binding<boolean>(true);
  private imageBackgroundColorBinding = new Binding<string>('#f8ebcb');
  
  // Array to hold images for animation
  private imagesToAnimate: ImageSource[] = [];
  // Current index for animated images
  private currentImageIndex = 0;
  // Interval ID for the animation
  private animatedIntervalId = -1;
  
  //#region Predefined controller images
  
  // Right controller
  
  private buttonYRightImages: string[] = [
    '24075106368805281',  // Button Y - Frame 1
    '1260848382187625',   // Button Y - Frame 2
    '1932460207576625',   // Button Y - Frame 3
  ];

  private buttonXRightImages: string[] = [
    '1278927913592926',   // Button X - Frame 1
    '1875928019806600',   // Button X - Frame 2
    '1266747091525498',   // Button X - Frame 3
  ];
  
  private buttonBackRightImages: string[] = [
    '1265438781789408',   // Back - Right - Frame 1
    '2114347062422908',   // Back - Right - Frame 2
    '1252303613260532',   // Back - Right - Frame 3
  ];
  
  private buttonDownRightImages: string[] = [
    '647342821721841',    // Down - Right - Frame 1
    '726164320215063',    // Down - Right - Frame 2
    '679290428469388',    // Down - Right - Frame 3
  ];
  
  // Left controller
  
  private buttonALeftImages: string[] = [
    '1283891646700073',   // Button A - Left - Frame 1
    '1120200056837106',   // Button A - Left - Frame 2
    '1374658973626398',   // Button A - Left - Frame 3
  ];

  private buttonBLeftImages: string[] = [
    '2311035692632624',   // Button B - Left - Frame 1
    '1519794102598945',   // Button B - Left - Frame 2
    '719553900917899',    // Button B - Left - Frame 3
  ];

  private buttonBackLeftImages: string[] = [
    '1146268497328960',   // Button Back - Left - Frame 1
    '1745866026808421',   // Button Back - Left - Frame 2
    '1939762466860547',   // Button Back - Left - Frame 3
  ];

  private buttonDownLeftImages: string[] = [
    '725610317130602',    // Down - Right - Frame 1
    '1041808547791604',   // Down - Right - Frame 2
    '1293439288963359',   // Down - Right - Frame 3
  ];
  
  //#endregion
  
  /**
   * Builds and initializes the UI structure of the panel.
   * @returns The root UI node of the panel.
   */
  initializeUI(): UINode {
    return View({
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: this.props.backgroundColor,
        opacity: this.props.backgroundOpacity,
        flexDirection: 'row',
        padding: 10,
        borderRadius: this.props.borderRadius,
        borderColor: this.props.borderColor,
        borderWidth: this.props.borderWidth,
      },
      children: [
        // Left view
        UINode.if(this.props.isImageLeft, this.imageView()),
        // Right view
        this.textView(),
        UINode.if(!this.props.isImageLeft, this.imageView()),
        // Close button at top right
          UINode.if(this.showCloseButtonBinding, this.closeButtonView())
      ]
    });
  }

  /**
   * Begins the lifecycle of the UI, including setting initial values and starting animation if enabled.
   */
  start() {
    this.titleBinding.set(this.props.initialTitle);
    this.messageBinding.set(this.props.initialMessage);
    if (this.props.initialImage) {
      this.imageBinding.set(ImageSource.fromTextureAsset(new Asset(BigInt(this.props.initialImage))));
    }
    
    this.showCloseButtonBinding.set(this.props.showCloseButton);
    
    if (this.props.isPredefinedButtonA) this.loadButtonA();
    if (this.props.isPredefinedButtonB) this.loadButtonB();
    if (this.props.isPredefinedButtonX) this.loadButtonX();
    if (this.props.isPredefinedButtonY) this.loadButtonY();
    if (this.props.isPredefinedTriggerLeft) this.loadTriggerLeft();
    if (this.props.isPredefinedTriggerRight) this.loadTriggerRight();
    if (this.props.isPredefinedDownLeft) this.loadDownLeft();
    if (this.props.isPredefinedDownRight) this.loadDownRight();
    
    if (this.props.isAnimated) {
      this.loadChildImages();
      this.animate(this.props.spriteFrequency);
    }
  }
  
  /**
   * Updates the title and message content dynamically.
   * @param title The title to display.
   * @param message The message to display.
   */
  trigger(title: string, message: string) {
    this.titleBinding.set(title);
    this.messageBinding.set(message);
  }
  
  //#region Views
  
  /**
   * Builds the view structure for the image.
   * @returns The view structure for the image
   */
  imageView(): UINode {
    return View({
      style: {
        height: '100%',
        aspectRatio: 1,
        backgroundColor: this.imageBackgroundColorBinding,
      },
      children: [
        // Image
        Image({
          source: this.imageBinding,
          style: {
            height: '100%',
            aspectRatio: 1
          }
        }),
      ]
    });
  }
  
  /**
   * Builds the view structure for the title, separator, and message.
   * @returns The view structure for the title, separator, and message
   */
  textView(): UINode {
    return View({
      style: {
        flex: 1, 
        justifyContent: 'center',
        padding: 10,
        alignSelf: 'stretch',
      },
      children: [
        // Title
        Text({
          text: this.titleBinding,
          style: {
            width: '95%', // Change from '70%' to '100%'
            fontSize: this.props.titleFontSize,
            color: this.props.titleColor,
            textAlign: this.props.titleCenterAligned ? 'center' : 'left',
            textAlignVertical: 'center',
          }
        }),
        // Separator
        View({
          style: {
            width: this.props.separatorWidth,
            height: this.props.separatorHeight,
            backgroundColor: this.props.separatorColor,
            marginBottom: this.props.separatorMarginBottom,
            marginEnd: this.props.separatorMarginBottom,
            alignSelf: this.props.separatorWidth === '100%' ? 'stretch' : 'center',
          }
        }),
        // Message
        Text({
          text: this.messageBinding,
          style: {
            width: '100%',
            fontSize: this.props.messageFontSize,
            color: this.props.messageColor,
            textAlign: this.props.messageCenterAligned ? 'center' : 'left',
            textAlignVertical: 'center',
          }
        }),
      ]
    });
  }
  
  /**
   * Builds the close button UI element.
   * @returns The close button view
   */
  closeButtonView(): UINode {
    return Pressable({
      style: {
        position: 'absolute',
        top: 10,
        right: 10,
        aspectRatio: 1,
        backgroundColor: this.props.closeBackgroundColor,
        borderRadius: this.props.borderRadius,
        paddingHorizontal: 20,
        paddingVertical: 0,
      },
      children: [
        Text({
          text: 'X',
          style: {
            fontSize: this.props.closeFontSize,
            color: this.props.closeColor,
            textAlign: 'center',
            textAlignVertical: 'center'
          }
        })
      ]
    });
  }
  
  //#endregion

  //#region Animation Methods

  /**
   * Initiates the animated image sequence with a specified frequency.
   * @param cooldown Frequency of the animation in milliseconds.
   */
  animate(cooldown: number = 0.5) {
    this.currentImageIndex = 0;
    this.animatedIntervalId = this.async.setInterval(()=> {
      this.imageBinding.set(this.imagesToAnimate[this.currentImageIndex]);
      this.currentImageIndex++;
      if (this.currentImageIndex >= this.imagesToAnimate.length) {
        this.currentImageIndex = 0;
      }
    }, cooldown * 1000);
  }
  
  /**
   * Stops the animated image sequence and resets it.
   */
  stopAnimation() {
    this.async.clearInterval(this.animatedIntervalId);
    this.currentImageIndex = 0;
    this.imageBinding.set(this.imagesToAnimate[this.currentImageIndex]);
  }
  
  /**
   * Loads all the images found in child entities.
   */
  loadChildImages() {
    const children = this.entity.children.get();
    const sprites: TutorialImageInfo[] = [];
    children.forEach((child) => {
      const tutorialImageInfoComponents = child.getComponents(TutorialImageInfo);
      if (tutorialImageInfoComponents.length > 0) {
        sprites.push(tutorialImageInfoComponents[0]);
      }
    });
    
    // Sort images by its order property
    sprites.sort((a, b) => a.props.order - b.props.order);
    for (let i = 0; i < sprites.length; i++) {
      const sprite = sprites[i];
      const image = ImageSource.fromTextureAsset(new Asset(BigInt(sprite.props.imageId)));
      this.imagesToAnimate.push(image);
    }
    
  }

  /**
   * Loads all the images found in child entities.
   * @param imageIds Array of image IDs to load.
   */
  private loadButtonImages(imageIds: string[]) {
    // Reset imagesToAnimate
    this.imagesToAnimate = [];

    // Copy images from the provided array
    for (const imageId of imageIds) {
      const image = ImageSource.fromTextureAsset(new Asset(BigInt(imageId)));
      this.imagesToAnimate.push(image);
    }

    // Start the animation
    this.animate(this.props.spriteFrequency);
  }
  
  /**
   *  Loads the predefined images for button A.
   */
  loadButtonA() {
    this.loadButtonImages(this.buttonALeftImages);
  }

  /**
   * Loads the predefined images for button B.
   */
  loadButtonB() {
    this.loadButtonImages(this.buttonBLeftImages);
  }

  /**
   * Loads the predefined images for button X.
   */
  loadButtonX() {
    this.loadButtonImages(this.buttonXRightImages);
  }

  /**
   * Loads the predefined images for button Y.
   */
  loadButtonY() {
    this.loadButtonImages(this.buttonYRightImages);
  }

  /**
   * Loads the predefined images for the left trigger button.
   */
  loadTriggerLeft() {
    this.loadButtonImages(this.buttonBackLeftImages);
  }

  /**
   * Loads the predefined images for the right trigger button.
   */
  loadTriggerRight() {
    this.loadButtonImages(this.buttonBackRightImages);
  }

  /**
   * Loads the predefined images for the down left button.
   */
  loadDownLeft() {
    this.loadButtonImages(this.buttonDownLeftImages);
  }

  /**
   * Loads the predefined images for the down right button.
   */
  loadDownRight() {
    this.loadButtonImages(this.buttonDownRightImages);
  }
  //#endregion
}

// Register the component so it can be used in the world
UIComponent.register(TutorialUIController);