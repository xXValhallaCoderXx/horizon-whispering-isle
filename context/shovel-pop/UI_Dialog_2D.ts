/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// import * as hz from 'horizon/core';
// import { Binding, Pressable, Text, UIComponent, UINode, View, ViewStyle } from 'horizon/ui';
// import { NPC } from 'NPC';

// export class UI_Dialog_2D extends UIComponent<typeof UI_Dialog_2D> {
//   static propsDefinition = {
//     textColor: { type: hz.PropTypes.Color },
//     bgColor: { type: hz.PropTypes.Color },
//     buttonColor: { type: hz.PropTypes.Color },
//     interactionTrigger: { type: hz.PropTypes.Entity }
//   };

//   panelHeight = 460;
//   panelWidth = 460;

//   private dialogTitle = new Binding<string>("talker");

//   private line = new Binding<string>("i am saying a thing");
//   private option1 = new Binding<string>("option1");
//   private option2 = new Binding<string>("option2");
//   private option3 = new Binding<string>("option3");

//   private dialogVisible = new Binding<boolean>(false);
//   private option1Visible = new Binding<boolean>(true);
//   private option2Visible = new Binding<boolean>(true);
//   private option3Visible = new Binding<boolean>(true);

//   private optionTree: number[] = []; // tracks which options we have chosen
//   private speakingPlayer: hz.Player | null = null

//   start(){
//     if (this.entity.owner.get() === hz.World.prototype.getServerPlayer()){
//       return;
//     }

//     this.props.interactionTrigger?.as(hz.TriggerGizmo).setWhoCanTrigger([this.entity.owner.get()])
//     this.props.interactionTrigger?.as(hz.TriggerGizmo).enabled.set(true)

//     this.connectCodeBlockEvent(this.props.interactionTrigger!, hz.CodeBlockEvents.OnPlayerEnterTrigger, (player) =>{
//       if (player !== this.entity.owner.get()){
//         return
//       }

//       this.speakingPlayer = player
//       this.props.interactionTrigger?.as(hz.TriggerGizmo).enabled.set(false)

//       this.connectNetworkEvent(this.entity, NPC.NetworkSendResponseOptions, (event) => {
//         let emptyResponse = event.response[0] === ""
//         if (emptyResponse){
//           this.optionTree = [];
//           this.props.interactionTrigger?.as(hz.TriggerGizmo).enabled.set(true)
//         }
//         else{
//           this.updateText(event.response)
//         }

//         this.dialogVisible.set(!emptyResponse); // have visibility toggle respond to network
//       })

//       // send request to receive the first line
//       this.sendNetworkEvent(this.entity, NPC.LocalSendDialogTreeKey, { id: this.entity.owner.get().id, key: this.optionTree});
//     })

//     this.connectNetworkEvent(this.entity, NPC.NetworkSendName, (event) => this.dialogTitle.set(event.name))
//   }

//   dispose() {
//     this.dialogVisible.set(false);
//   }

//   public chooseDialogOption(option: number, player: hz.Player){
//     this.optionTree.push(option);
//     this.sendNetworkEvent(this.entity, NPC.LocalSendDialogTreeKey, {id: player.id, key: this.optionTree}); // send our dialog tree to the server to get the responses
//   }

//   public updateText(script: string[]){
//     this.line.set(script[0]);

//     this.option1.set(script[1]);
//     this.option1Visible.set(script[1] !== "");

//     this.option2.set(script[2]);
//     this.option2Visible.set(script[2] !== "");

//     this.option3.set(script[3]);
//     this.option3Visible.set(script[3] !== "");
//   }

//   buttonStyle: ViewStyle = {
//     alignItems: 'center',
//     backgroundColor: 'green',
//     borderRadius: 8,
//     height: 48,
//     justifyContent: 'center',
//     marginTop: '1%',
//     width: '80%',
//   }

//   initializeUI() {
//     const buttonOption1 = Pressable({
//       children:
//       Text({
//         text: this.option1,
//         style: {
//           color: this.props.textColor,
//           textAlign: 'center',
//           fontSize: 20,
//           fontFamily: 'Roboto',
//           textShadowOffset: [0,1],
//           textShadowColor: 'black',
//           textShadowRadius: 4,
//         },
//       }),
//       style: this.buttonStyle,
//       onClick: (player) => this.chooseDialogOption(0, player),
//     })

//     const buttonOption2 = Pressable({
//       children:
//       Text({
//         text: this.option2,
//         style: {
//           color: this.props.textColor,
//           textAlign: 'center',
//           fontSize: 20,
//           fontFamily: 'Roboto',
//           textShadowOffset: [0,1],
//           textShadowColor: 'black',
//           textShadowRadius: 4,
//         },
//       }),
//       style: this.buttonStyle,
//       onClick: (player) => this.chooseDialogOption(1, player),
//     })

//     const buttonOption3 = Pressable({
//       children:
//       Text({
//         text: this.option3,
//         style: {
//           color: this.props.textColor,
//           textAlign: 'center',
//           fontSize: 20,
//           fontFamily: 'Roboto',
//           textShadowOffset: [0,1],
//           textShadowColor: 'black',
//           textShadowRadius: 4,
//         },
//       }),
//       style: this.buttonStyle,
//       onClick: (player) => this.chooseDialogOption(2, player),
//     })

//     return UINode.if(this.dialogVisible, View({
//       children: [
//         Text({ text: this.dialogTitle, style: { // header
//           fontSize: 24,
//           fontFamily: 'Roboto',
//           color: this.props.textColor,
//           textShadowOffset: [0,1],
//           textShadowColor: 'black',
//           textShadowRadius: 4,
//           textAlign: 'center',

//         } }),
//         Text({ text: this.line, style: { // dialog
//           fontSize: 32,
//           fontFamily: 'Roboto',
//           textShadowOffset: [0,1],
//           textShadowColor: 'black',
//           textShadowRadius: 4,
//           color: this.props.textColor,
//           paddingBottom: 20,
//           textAlign: 'center'
//         } }),
//         UINode.if(this.option1Visible, buttonOption1),
//         UINode.if(this.option2Visible, buttonOption2),
//         UINode.if(this.option3Visible, buttonOption3),
//       ],
//         style: {
//           alignItems: 'center',
//           backgroundColor: this.props.bgColor,
//           borderRadius: 24,
//           flexDirection: 'column',
//           padding: 15,
//           width: '35%',
//           alignSelf: 'center',
//           justifyContent: 'center',
//           position: 'absolute',
//           top: "20%",
//           opacity: 0.9
//         },
//     }))
//   }
// }
// UIComponent.register(UI_Dialog_2D);
