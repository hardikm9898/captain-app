package com.billerpe.captain;

import android.graphics.Color;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Clear of the status bar, notch and gesture bar on every phone.
        EdgeInsets.apply(this, Color.parseColor("#FBFAF8"), Color.parseColor("#FFFFFF"), false);
    }
}
