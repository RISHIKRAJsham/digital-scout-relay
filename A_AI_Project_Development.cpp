#include <iostream>
using namespace std;

int main(){
    int t;
    cin>>t;
    while(t--){
        int n, x, y, z;
        cin>>n>>x>>y>>z;
        
        int ans1, ans2;
        
        // Option 1: No AI
        if(n % (x + y) == 0){
            ans1 = n / (x + y);
        } else {
            ans1 = (n / (x + y)) + 1;
        }
        
        // Save the original n before modifying it!
        int original_n = n; 
        
        // Subtract lines written by Maxim during setup
        n = n - (x * z);
        
        // If n <= 0, Maxim finished before AI was ready.
        // Use original_n to calculate his time, NOT the negative n!
        if(n <= 0){
            if(original_n % x == 0){
                ans2 = original_n / x;
            } else {
                ans2 = (original_n / x) + 1;
            }
        } 
        // Otherwise, calculate the time it takes to finish the remaining n lines
        else {
            if(n % (x + (10 * y)) == 0){
                ans2 = (n / (x + (10 * y))) + z;
            } else {
                ans2 = (n / (x + (10 * y))) + z + 1;
            }
        }
        
        cout << min(ans1, ans2) << endl;
    }
    return 0;
}